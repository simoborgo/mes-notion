import type { Pool, PoolClient } from "pg";
import { pool } from "./db";
import { ensureClienteVerniciaturaEsisteId } from "./clientiVerniciaturaRepository";
import { generaCodicePubblico, trovaCodicePubblicoRiusabile } from "./barcodeVerniciatura";
import type {
  SchedaVerniciatura,
  SchedaFase,
  SchedaFaseProdottoRiga,
  SchedaVerniciaturaFoto,
  RuoloInFase,
  StatoSchedaVerniciatura,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSchedaRow(r: any): SchedaVerniciatura {
  return {
    id: r.id,
    nome: r.nome,
    schedaPadreId: r.scheda_padre_id,
    stato: r.stato,
    versione: r.versione,
    validatoAt: r.validato_at ? new Date(r.validato_at).toISOString() : null,
    note: r.note,
    essenza: r.essenza,
    ignifuga: r.ignifuga,
    cliente: r.cliente_nome ?? null,
    commessaId: r.commessa_id,
    numeroCommessa: r.numero_commessa ?? null,
    codiceCampioneMaterialista: r.codice_campione_materialista,
    codicePubblico: r.codice_pubblico,
    dataProva: r.data_prova instanceof Date ? r.data_prova.toISOString().slice(0, 10) : r.data_prova,
    driveFolderId: r.drive_folder_id,
    attivo: r.attivo,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProdottoRow(r: any): SchedaFaseProdottoRiga {
  return {
    id: r.id,
    verniceId: r.vernice_id,
    ruoloInFase: r.ruolo_in_fase,
    quantita: r.quantita != null ? Number(r.quantita) : null,
    unita: r.unita,
    note: r.note,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFotoRow(r: any): SchedaVerniciaturaFoto {
  return { id: r.id, driveFileId: r.drive_file_id, nomeFile: r.nome_file, ordine: r.ordine };
}

const SELECT_SCHEDA = `SELECT sv.*, cv.nome AS cliente_nome, cm.numero_commessa
  FROM schede_verniciatura sv
  LEFT JOIN clienti_verniciatura cv ON cv.id = sv.cliente_id
  LEFT JOIN commesse cm ON cm.id = sv.commessa_id`;

export interface SchedeFiltro {
  stato?: StatoSchedaVerniciatura;
  nome?: string;
  cliente?: string;
  codicePubblico?: string;
  soloAttive?: boolean;
}

export async function getSchede(filtro: SchedeFiltro = {}): Promise<SchedaVerniciatura[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (filtro.soloAttive !== false) where.push(`sv.attivo = true`);
  if (filtro.stato) { where.push(`sv.stato = $${i++}`); values.push(filtro.stato); }
  if (filtro.nome) { where.push(`sv.nome ILIKE $${i++}`); values.push(`%${filtro.nome}%`); }
  if (filtro.cliente) { where.push(`cv.nome = $${i++}`); values.push(filtro.cliente); }
  if (filtro.codicePubblico) { where.push(`sv.codice_pubblico = $${i++}`); values.push(filtro.codicePubblico); }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await pool.query(`${SELECT_SCHEDA} ${whereClause} ORDER BY sv.created_at DESC`, values);
  return rows.map(mapSchedaRow);
}

async function fetchFasiEFoto(scheda: SchedaVerniciatura, executor: Pool | PoolClient): Promise<SchedaVerniciatura> {
  const { rows: fasiRows } = await executor.query(`SELECT * FROM schede_verniciatura_fasi WHERE scheda_id = $1 ORDER BY ordine`, [scheda.id]);
  const fasi: SchedaFase[] = [];
  for (const f of fasiRows) {
    const { rows: prodottiRows } = await executor.query(`SELECT * FROM schede_verniciatura_fasi_prodotti WHERE fase_id = $1 ORDER BY created_at`, [f.id]);
    fasi.push({ id: f.id, ordine: f.ordine, nomeFase: f.nome_fase, note: f.note, prodotti: prodottiRows.map(mapProdottoRow) });
  }
  scheda.fasi = fasi;

  const { rows: fotoRows } = await executor.query(`SELECT * FROM schede_verniciatura_foto WHERE scheda_id = $1 ORDER BY ordine NULLS LAST, created_at`, [scheda.id]);
  scheda.foto = fotoRows.map(mapFotoRow);
  return scheda;
}

export async function getSchedaById(id: string, executor: Pool | PoolClient = pool): Promise<SchedaVerniciatura> {
  const { rows } = await executor.query(`${SELECT_SCHEDA} WHERE sv.id = $1`, [id]);
  if (rows.length === 0) throw new Error(`Scheda non trovata: ${id}`);
  return fetchFasiEFoto(mapSchedaRow(rows[0]), executor);
}

// Barcode non univoco per design (riuso intenzionale): ritorna tutte le righe con quel codice,
// più recente per prima — l'operatore in produzione sceglie/vede l'ultima per default.
export async function getSchedeByCodicePubblico(codicePubblico: string): Promise<SchedaVerniciatura[]> {
  const { rows } = await pool.query(`${SELECT_SCHEDA} WHERE sv.codice_pubblico = $1 ORDER BY sv.created_at DESC`, [codicePubblico]);
  return rows.map(mapSchedaRow);
}

interface FaseInput {
  ordine: number;
  nomeFase?: string | null;
  note?: string | null;
  prodotti: { verniceId: string; ruoloInFase: RuoloInFase; quantita?: number | null; unita?: string | null; note?: string | null }[];
}

// Crea la v1 di una scheda: ciclo (fasi+vernici) + cliente + riferimento colore, tutto insieme —
// a differenza del vecchio flusso Ciclo/Campionatura separati. Cliente obbligatorio (creato al
// volo se nuovo), barcode generato o riusato da una scheda approvata con le stesse vernici
// principali per lo stesso cliente (stessa logica di continuità di prima, ora su schede_verniciatura).
export async function createScheda(data: {
  nome?: string | null;
  note?: string | null;
  essenza?: string | null;
  ignifuga?: boolean | null;
  cliente: string;
  commessaId?: string | null;
  codiceCampioneMaterialista?: string | null;
  dataProva?: string | null;
  forzaNuovoBarcode?: boolean;
  fasi: FaseInput[];
}): Promise<SchedaVerniciatura> {
  const { id: clienteId, nome: clienteNome } = await ensureClienteVerniciaturaEsisteId(data.cliente);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO schede_verniciatura (nome, note, essenza, ignifuga, cliente_id, commessa_id, codice_campione_materialista, data_prova)
       VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8, CURRENT_DATE)) RETURNING id`,
      [data.nome ?? null, data.note ?? null, data.essenza ?? null, data.ignifuga ?? null, clienteId, data.commessaId ?? null, data.codiceCampioneMaterialista ?? null, data.dataProva ?? null]
    );
    const schedaId = rows[0].id as string;

    for (const fase of data.fasi) {
      const { rows: faseRows } = await client.query(
        `INSERT INTO schede_verniciatura_fasi (scheda_id, ordine, nome_fase, note) VALUES ($1,$2,$3,$4) RETURNING id`,
        [schedaId, fase.ordine, fase.nomeFase ?? null, fase.note ?? null]
      );
      const faseId = faseRows[0].id as string;
      for (const p of fase.prodotti) {
        await client.query(
          `INSERT INTO schede_verniciatura_fasi_prodotti (fase_id, vernice_id, ruolo_in_fase, quantita, unita, note) VALUES ($1,$2,$3,$4,$5,$6)`,
          [faseId, p.verniceId, p.ruoloInFase, p.quantita ?? null, p.unita ?? null, p.note ?? null]
        );
      }
    }

    let codicePubblico: string | null = null;
    if (!data.forzaNuovoBarcode) {
      codicePubblico = await trovaCodicePubblicoRiusabile(clienteId, schedaId, client);
    }
    if (!codicePubblico) {
      codicePubblico = await generaCodicePubblico(client, clienteNome);
    }
    await client.query(`UPDATE schede_verniciatura SET codice_pubblico = $1 WHERE id = $2`, [codicePubblico, schedaId]);

    await client.query("COMMIT");
    return getSchedaById(schedaId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// nome/note/essenza/ignifuga/codiceCampioneMaterialista/dataProva sono sempre modificabili, anche
// a scheda approvata/rifiutata: non toccano la "ricetta" (fasi/prodotti) né cliente/barcode
// (fissi dalla creazione, ereditati da genera-figlio — vedi types.ts).
export async function updateScheda(
  id: string,
  data: { nome?: string | null; note?: string | null; essenza?: string | null; ignifuga?: boolean | null; codiceCampioneMaterialista?: string | null; dataProva?: string | null }
): Promise<SchedaVerniciatura> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (data.nome !== undefined) { sets.push(`nome = $${i++}`); values.push(data.nome); }
  if (data.note !== undefined) { sets.push(`note = $${i++}`); values.push(data.note); }
  if (data.essenza !== undefined) { sets.push(`essenza = $${i++}`); values.push(data.essenza); }
  if (data.ignifuga !== undefined) { sets.push(`ignifuga = $${i++}`); values.push(data.ignifuga); }
  if (data.codiceCampioneMaterialista !== undefined) { sets.push(`codice_campione_materialista = $${i++}`); values.push(data.codiceCampioneMaterialista); }
  if (data.dataProva !== undefined) { sets.push(`data_prova = $${i++}`); values.push(data.dataProva); }
  if (sets.length === 0) return getSchedaById(id);
  sets.push(`updated_at = now()`);
  values.push(id);
  const { rows } = await pool.query(`UPDATE schede_verniciatura SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`, values);
  if (rows.length === 0) throw new Error(`Scheda non trovata: ${id}`);
  return getSchedaById(id);
}

// Eliminare una scheda elimina l'intera storia versioni (bozze/rifiutate/approvate): le versioni
// sono la stessa "scheda" nel senso dell'utente, non entità indipendenti — lasciarne in giro
// orfane dopo aver eliminato una versione sarebbe confuso. Risale alla radice della catena
// (scheda_padre_id) e poi ridiscende su tutti i discendenti via CTE ricorsiva; funziona a
// prescindere da quale versione della catena viene eliminata. Ritorna gli id disattivati (per
// aggiornare la UI senza dover rifare fetch).
export async function disattivaLineage(id: string): Promise<string[]> {
  const { rows } = await pool.query(
    `WITH RECURSIVE ancestors AS (
       SELECT id, scheda_padre_id FROM schede_verniciatura WHERE id = $1
       UNION ALL
       SELECT sv.id, sv.scheda_padre_id
       FROM schede_verniciatura sv
       JOIN ancestors a ON sv.id = a.scheda_padre_id
     ),
     root AS (
       SELECT id FROM ancestors WHERE scheda_padre_id IS NULL LIMIT 1
     ),
     lineage AS (
       SELECT id FROM root
       UNION ALL
       SELECT sv.id
       FROM schede_verniciatura sv
       JOIN lineage l ON sv.scheda_padre_id = l.id
     )
     UPDATE schede_verniciatura SET attivo = false, updated_at = now()
     WHERE id IN (SELECT id FROM lineage)
     RETURNING id`,
    [id]
  );
  if (rows.length === 0) throw new Error(`Scheda non trovata: ${id}`);
  return rows.map((r) => r.id as string);
}

export async function setSchedaDriveFolderId(id: string, driveFolderId: string): Promise<void> {
  await pool.query(`UPDATE schede_verniciatura SET drive_folder_id = $1, updated_at = now() WHERE id = $2`, [driveFolderId, id]);
}

// Lock pessimistico + guardia di immutabilità, riusata da tutte le mutazioni su fasi/prodotti:
// una scheda approvata o rifiutata è immutabile (l'esito giudica una ricetta precisa), qualsiasi
// modifica va fatta generando una nuova versione (genera-figlio). bozza/in_revisione restano
// modificabili.
async function withSchedaMutabileTransazione<T>(schedaId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT stato FROM schede_verniciatura WHERE id = $1 FOR UPDATE`, [schedaId]);
    if (rows.length === 0) throw new Error(`Scheda non trovata: ${schedaId}`);
    if (rows[0].stato === "approvato" || rows[0].stato === "rifiutato") {
      throw new Error("Scheda già approvata o rifiutata: immutabile. Usa genera-figlio per modificarla.");
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function addFase(schedaId: string, data: { ordine: number; nomeFase?: string | null; note?: string | null }): Promise<SchedaVerniciatura> {
  await withSchedaMutabileTransazione(schedaId, async (client) => {
    await client.query(
      `INSERT INTO schede_verniciatura_fasi (scheda_id, ordine, nome_fase, note) VALUES ($1,$2,$3,$4)`,
      [schedaId, data.ordine, data.nomeFase ?? null, data.note ?? null]
    );
  });
  return getSchedaById(schedaId);
}

export async function updateFase(schedaId: string, faseId: string, data: { ordine?: number; nomeFase?: string | null; note?: string | null }): Promise<SchedaVerniciatura> {
  await withSchedaMutabileTransazione(schedaId, async (client) => {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (data.ordine !== undefined) { sets.push(`ordine = $${i++}`); values.push(data.ordine); }
    if (data.nomeFase !== undefined) { sets.push(`nome_fase = $${i++}`); values.push(data.nomeFase); }
    if (data.note !== undefined) { sets.push(`note = $${i++}`); values.push(data.note); }
    if (sets.length === 0) return;
    values.push(faseId, schedaId);
    const { rowCount } = await client.query(
      `UPDATE schede_verniciatura_fasi SET ${sets.join(", ")} WHERE id = $${i++} AND scheda_id = $${i}`,
      values
    );
    if (rowCount === 0) throw new Error(`Fase non trovata: ${faseId}`);
  });
  return getSchedaById(schedaId);
}

export async function deleteFase(schedaId: string, faseId: string): Promise<SchedaVerniciatura> {
  await withSchedaMutabileTransazione(schedaId, async (client) => {
    const { rowCount } = await client.query(`DELETE FROM schede_verniciatura_fasi WHERE id = $1 AND scheda_id = $2`, [faseId, schedaId]);
    if (rowCount === 0) throw new Error(`Fase non trovata: ${faseId}`);
  });
  return getSchedaById(schedaId);
}

export async function addProdotto(
  schedaId: string,
  faseId: string,
  data: { verniceId: string; ruoloInFase: RuoloInFase; quantita?: number | null; unita?: string | null; note?: string | null }
): Promise<SchedaVerniciatura> {
  await withSchedaMutabileTransazione(schedaId, async (client) => {
    const { rowCount } = await client.query(`SELECT 1 FROM schede_verniciatura_fasi WHERE id = $1 AND scheda_id = $2`, [faseId, schedaId]);
    if (rowCount === 0) throw new Error(`Fase non trovata: ${faseId}`);
    await client.query(
      `INSERT INTO schede_verniciatura_fasi_prodotti (fase_id, vernice_id, ruolo_in_fase, quantita, unita, note) VALUES ($1,$2,$3,$4,$5,$6)`,
      [faseId, data.verniceId, data.ruoloInFase, data.quantita ?? null, data.unita ?? null, data.note ?? null]
    );
  });
  return getSchedaById(schedaId);
}

export async function deleteProdotto(schedaId: string, faseId: string, prodottoId: string): Promise<SchedaVerniciatura> {
  await withSchedaMutabileTransazione(schedaId, async (client) => {
    const { rowCount } = await client.query(`DELETE FROM schede_verniciatura_fasi_prodotti WHERE id = $1 AND fase_id = $2`, [prodottoId, faseId]);
    if (rowCount === 0) throw new Error(`Prodotto non trovato: ${prodottoId}`);
  });
  return getSchedaById(schedaId);
}

// Nuova versione (prova) della scheda: clona fasi/prodotti + cliente/riferimento colore/barcode
// dal padre (ereditati, non editabili per versione — vedi types.ts), NON le foto (specifiche
// della prova) né data_prova (riparte da CURRENT_DATE: è una prova nuova). Riparte sempre da bozza.
export async function generaFiglio(schedaPadreId: string): Promise<SchedaVerniciatura> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: padreRows } = await client.query(`SELECT * FROM schede_verniciatura WHERE id = $1`, [schedaPadreId]);
    if (padreRows.length === 0) throw new Error(`Scheda non trovata: ${schedaPadreId}`);
    const padre = padreRows[0];

    const { rows: figlioRows } = await client.query(
      `INSERT INTO schede_verniciatura (nome, scheda_padre_id, stato, versione, note, essenza, ignifuga, cliente_id, commessa_id, codice_campione_materialista, codice_pubblico)
       VALUES ($1, $2, 'bozza', $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [padre.nome, schedaPadreId, (padre.versione as number) + 1, padre.note, padre.essenza, padre.ignifuga, padre.cliente_id, padre.commessa_id, padre.codice_campione_materialista, padre.codice_pubblico]
    );
    const figlioId = figlioRows[0].id as string;

    const { rows: fasi } = await client.query(`SELECT * FROM schede_verniciatura_fasi WHERE scheda_id = $1 ORDER BY ordine`, [schedaPadreId]);
    for (const fase of fasi) {
      const { rows: nuovaFaseRows } = await client.query(
        `INSERT INTO schede_verniciatura_fasi (scheda_id, ordine, nome_fase, note) VALUES ($1,$2,$3,$4) RETURNING id`,
        [figlioId, fase.ordine, fase.nome_fase, fase.note]
      );
      const nuovaFaseId = nuovaFaseRows[0].id as string;
      const { rows: prodotti } = await client.query(`SELECT * FROM schede_verniciatura_fasi_prodotti WHERE fase_id = $1`, [fase.id]);
      for (const p of prodotti) {
        await client.query(
          `INSERT INTO schede_verniciatura_fasi_prodotti (fase_id, vernice_id, ruolo_in_fase, quantita, unita, note) VALUES ($1,$2,$3,$4,$5,$6)`,
          [nuovaFaseId, p.vernice_id, p.ruolo_in_fase, p.quantita, p.unita, p.note]
        );
      }
    }
    await client.query("COMMIT");
    return getSchedaById(figlioId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Cambia lo stato della scheda. Per 'approvato': verifica strutturale (ogni fase ha almeno una
// vernice principale) + calcolo warning TS/SDS non bloccanti, poi scrive validato_at (idempotente:
// se già approvato, non fa nulla e non ricalcola warning). Per 'in_revisione'/'rifiutato': solo
// update di stato, nessuna verifica — fonde l'ex validaCicloInTransazione (cicli) con l'ex
// impostaEsito (campionature), ora sulla stessa riga.
export async function impostaStato(id: string, nuovoStato: StatoSchedaVerniciatura): Promise<{ scheda: SchedaVerniciatura; warnings: string[] }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM schede_verniciatura WHERE id = $1 FOR UPDATE`, [id]);
    if (rows.length === 0) throw new Error(`Scheda non trovata: ${id}`);
    const scheda = rows[0];

    let warnings: string[] = [];
    if (nuovoStato === "approvato" && scheda.stato !== "approvato") {
      const { rows: fasiSenzaVernice } = await client.query(
        `SELECT svf.id, svf.nome_fase FROM schede_verniciatura_fasi svf
         WHERE svf.scheda_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM schede_verniciatura_fasi_prodotti svfp WHERE svfp.fase_id = svf.id AND svfp.ruolo_in_fase = 'vernice'
           )`,
        [id]
      );
      if (fasiSenzaVernice.length > 0) {
        const nomi = fasiSenzaVernice.map((f) => f.nome_fase || f.id).join(", ");
        throw new Error(`Impossibile approvare: fasi senza vernice principale assegnata (${nomi})`);
      }

      const { rows: verniciUsate } = await client.query(
        `SELECT DISTINCT v.id, v.colore_codice, v.tipologia, v.ts_drive_file_id, v.sds_drive_file_id
         FROM schede_verniciatura_fasi_prodotti svfp
         JOIN schede_verniciatura_fasi svf ON svf.id = svfp.fase_id
         JOIN vernici v ON v.id = svfp.vernice_id
         WHERE svf.scheda_id = $1`,
        [id]
      );
      for (const v of verniciUsate) {
        const nome = v.colore_codice || v.tipologia || v.id;
        if (!v.ts_drive_file_id) warnings.push(`Scheda tecnica mancante per la vernice "${nome}"`);
        if (!v.sds_drive_file_id) warnings.push(`Scheda di sicurezza mancante per la vernice "${nome}"`);
      }

      await client.query(`UPDATE schede_verniciatura SET stato = 'approvato', validato_at = now(), updated_at = now() WHERE id = $1`, [id]);
    } else if (nuovoStato !== scheda.stato) {
      await client.query(`UPDATE schede_verniciatura SET stato = $1, updated_at = now() WHERE id = $2`, [nuovoStato, id]);
    }

    await client.query("COMMIT");
    return { scheda: await getSchedaById(id), warnings };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function addFoto(schedaId: string, data: { driveFileId: string; nomeFile?: string | null; ordine?: number | null }): Promise<SchedaVerniciatura> {
  await pool.query(
    `INSERT INTO schede_verniciatura_foto (scheda_id, drive_file_id, nome_file, ordine) VALUES ($1,$2,$3,$4)`,
    [schedaId, data.driveFileId, data.nomeFile ?? null, data.ordine ?? null]
  );
  return getSchedaById(schedaId);
}

// Ritorna anche il drive_file_id rimosso, così il chiamante può cancellarlo anche da Drive.
export async function deleteFoto(schedaId: string, fotoId: string): Promise<{ driveFileId: string }> {
  const { rows } = await pool.query(
    `DELETE FROM schede_verniciatura_foto WHERE id = $1 AND scheda_id = $2 RETURNING drive_file_id`,
    [fotoId, schedaId]
  );
  if (rows.length === 0) throw new Error(`Foto non trovata: ${fotoId}`);
  return { driveFileId: rows[0].drive_file_id as string };
}
