import type { Pool, PoolClient } from "pg";
import { pool } from "./db";
import type { Ciclo, CicloFase, CicloFaseProdottoRiga, RuoloInFase, StatoCiclo } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCicloRow(r: any): Ciclo {
  return {
    id: r.id,
    nome: r.nome,
    cicloPadreId: r.ciclo_padre_id,
    stato: r.stato,
    versione: r.versione,
    validatoAt: r.validato_at ? new Date(r.validato_at).toISOString() : null,
    validatoDaCampionaturaId: r.validato_da_campionatura_id,
    note: r.note,
    essenza: r.essenza,
    ignifuga: r.ignifuga,
    attivo: r.attivo,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProdottoRow(r: any): CicloFaseProdottoRiga {
  return {
    id: r.id,
    verniceId: r.vernice_id,
    ruoloInFase: r.ruolo_in_fase,
    quantita: r.quantita != null ? Number(r.quantita) : null,
    unita: r.unita,
    note: r.note,
  };
}

export interface CicliFiltro {
  stato?: StatoCiclo;
  nome?: string;
  soloAttivi?: boolean;
}

export async function getCicli(filtro: CicliFiltro = {}): Promise<Ciclo[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (filtro.soloAttivi !== false) where.push(`attivo = true`);
  if (filtro.stato) { where.push(`stato = $${i++}`); values.push(filtro.stato); }
  if (filtro.nome) { where.push(`nome ILIKE $${i++}`); values.push(`%${filtro.nome}%`); }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await pool.query(`SELECT * FROM cicli ${whereClause} ORDER BY created_at DESC`, values);
  return rows.map(mapCicloRow);
}

export async function getCicloById(id: string, executor: Pool | PoolClient = pool): Promise<Ciclo> {
  const { rows } = await executor.query(`SELECT * FROM cicli WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`Ciclo non trovato: ${id}`);
  const ciclo = mapCicloRow(rows[0]);

  const { rows: fasiRows } = await executor.query(`SELECT * FROM cicli_fasi WHERE ciclo_id = $1 ORDER BY ordine`, [id]);
  const fasi: CicloFase[] = [];
  for (const f of fasiRows) {
    const { rows: prodottiRows } = await executor.query(`SELECT * FROM cicli_fasi_prodotti WHERE fase_id = $1 ORDER BY created_at`, [f.id]);
    fasi.push({
      id: f.id,
      ordine: f.ordine,
      nomeFase: f.nome_fase,
      note: f.note,
      prodotti: prodottiRows.map(mapProdottoRow),
    });
  }
  ciclo.fasi = fasi;
  return ciclo;
}

interface FaseInput {
  ordine: number;
  nomeFase?: string | null;
  note?: string | null;
  prodotti: { verniceId: string; ruoloInFase: RuoloInFase; quantita?: number | null; unita?: string | null; note?: string | null }[];
}

export async function createCiclo(data: { nome?: string | null; note?: string | null; essenza?: string | null; ignifuga?: boolean | null; fasi: FaseInput[] }): Promise<Ciclo> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO cicli (nome, note, essenza, ignifuga) VALUES ($1, $2, $3, $4) RETURNING id`,
      [data.nome ?? null, data.note ?? null, data.essenza ?? null, data.ignifuga ?? null]
    );
    const cicloId = rows[0].id as string;

    for (const fase of data.fasi) {
      const { rows: faseRows } = await client.query(
        `INSERT INTO cicli_fasi (ciclo_id, ordine, nome_fase, note) VALUES ($1,$2,$3,$4) RETURNING id`,
        [cicloId, fase.ordine, fase.nomeFase ?? null, fase.note ?? null]
      );
      const faseId = faseRows[0].id as string;
      for (const p of fase.prodotti) {
        await client.query(
          `INSERT INTO cicli_fasi_prodotti (fase_id, vernice_id, ruolo_in_fase, quantita, unita, note) VALUES ($1,$2,$3,$4,$5,$6)`,
          [faseId, p.verniceId, p.ruoloInFase, p.quantita ?? null, p.unita ?? null, p.note ?? null]
        );
      }
    }
    await client.query("COMMIT");
    return getCicloById(cicloId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// nome/note/essenza/ignifuga sono sempre modificabili, anche a ciclo validato: non toccano la
// "ricetta" (fasi/prodotti).
export async function updateCiclo(id: string, data: { nome?: string | null; note?: string | null; essenza?: string | null; ignifuga?: boolean | null }): Promise<Ciclo> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (data.nome !== undefined) { sets.push(`nome = $${i++}`); values.push(data.nome); }
  if (data.note !== undefined) { sets.push(`note = $${i++}`); values.push(data.note); }
  if (data.essenza !== undefined) { sets.push(`essenza = $${i++}`); values.push(data.essenza); }
  if (data.ignifuga !== undefined) { sets.push(`ignifuga = $${i++}`); values.push(data.ignifuga); }
  if (sets.length === 0) return getCicloById(id);
  sets.push(`updated_at = now()`);
  values.push(id);
  const { rows } = await pool.query(`UPDATE cicli SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`, values);
  if (rows.length === 0) throw new Error(`Ciclo non trovato: ${id}`);
  return getCicloById(id);
}

export async function disattivaCiclo(id: string): Promise<void> {
  await pool.query(`UPDATE cicli SET attivo = false, updated_at = now() WHERE id = $1`, [id]);
}

// Lock pessimistico + guardia di immutabilità, riusata da tutte le mutazioni su fasi/prodotti:
// un ciclo validato è immutabile, qualsiasi modifica va fatta generando un figlio (genera-figlio).
async function withCicloBozzaTransazione<T>(cicloId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT stato FROM cicli WHERE id = $1 FOR UPDATE`, [cicloId]);
    if (rows.length === 0) throw new Error(`Ciclo non trovato: ${cicloId}`);
    if (rows[0].stato === "validato") {
      throw new Error("Ciclo già validato: immutabile. Usa genera-figlio per modificarlo.");
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

export async function addFase(cicloId: string, data: { ordine: number; nomeFase?: string | null; note?: string | null }): Promise<Ciclo> {
  await withCicloBozzaTransazione(cicloId, async (client) => {
    await client.query(
      `INSERT INTO cicli_fasi (ciclo_id, ordine, nome_fase, note) VALUES ($1,$2,$3,$4)`,
      [cicloId, data.ordine, data.nomeFase ?? null, data.note ?? null]
    );
  });
  return getCicloById(cicloId);
}

export async function updateFase(cicloId: string, faseId: string, data: { ordine?: number; nomeFase?: string | null; note?: string | null }): Promise<Ciclo> {
  await withCicloBozzaTransazione(cicloId, async (client) => {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (data.ordine !== undefined) { sets.push(`ordine = $${i++}`); values.push(data.ordine); }
    if (data.nomeFase !== undefined) { sets.push(`nome_fase = $${i++}`); values.push(data.nomeFase); }
    if (data.note !== undefined) { sets.push(`note = $${i++}`); values.push(data.note); }
    if (sets.length === 0) return;
    values.push(faseId, cicloId);
    const { rowCount } = await client.query(
      `UPDATE cicli_fasi SET ${sets.join(", ")} WHERE id = $${i++} AND ciclo_id = $${i}`,
      values
    );
    if (rowCount === 0) throw new Error(`Fase non trovata: ${faseId}`);
  });
  return getCicloById(cicloId);
}

export async function deleteFase(cicloId: string, faseId: string): Promise<Ciclo> {
  await withCicloBozzaTransazione(cicloId, async (client) => {
    const { rowCount } = await client.query(`DELETE FROM cicli_fasi WHERE id = $1 AND ciclo_id = $2`, [faseId, cicloId]);
    if (rowCount === 0) throw new Error(`Fase non trovata: ${faseId}`);
  });
  return getCicloById(cicloId);
}

export async function addProdotto(
  cicloId: string,
  faseId: string,
  data: { verniceId: string; ruoloInFase: RuoloInFase; quantita?: number | null; unita?: string | null; note?: string | null }
): Promise<Ciclo> {
  await withCicloBozzaTransazione(cicloId, async (client) => {
    const { rowCount } = await client.query(`SELECT 1 FROM cicli_fasi WHERE id = $1 AND ciclo_id = $2`, [faseId, cicloId]);
    if (rowCount === 0) throw new Error(`Fase non trovata: ${faseId}`);
    await client.query(
      `INSERT INTO cicli_fasi_prodotti (fase_id, vernice_id, ruolo_in_fase, quantita, unita, note) VALUES ($1,$2,$3,$4,$5,$6)`,
      [faseId, data.verniceId, data.ruoloInFase, data.quantita ?? null, data.unita ?? null, data.note ?? null]
    );
  });
  return getCicloById(cicloId);
}

export async function deleteProdotto(cicloId: string, faseId: string, prodottoId: string): Promise<Ciclo> {
  await withCicloBozzaTransazione(cicloId, async (client) => {
    const { rowCount } = await client.query(
      `DELETE FROM cicli_fasi_prodotti WHERE id = $1 AND fase_id = $2`,
      [prodottoId, faseId]
    );
    if (rowCount === 0) throw new Error(`Prodotto non trovato: ${prodottoId}`);
  });
  return getCicloById(cicloId);
}

export async function generaFiglio(cicloPadreId: string): Promise<Ciclo> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: padreRows } = await client.query(`SELECT * FROM cicli WHERE id = $1`, [cicloPadreId]);
    if (padreRows.length === 0) throw new Error(`Ciclo non trovato: ${cicloPadreId}`);
    const padre = padreRows[0];

    const { rows: figlioRows } = await client.query(
      `INSERT INTO cicli (nome, ciclo_padre_id, stato, versione, note, essenza, ignifuga)
       VALUES ($1, $2, 'bozza', $3, $4, $5, $6) RETURNING id`,
      [padre.nome, cicloPadreId, (padre.versione as number) + 1, padre.note, padre.essenza, padre.ignifuga]
    );
    const figlioId = figlioRows[0].id as string;

    const { rows: fasi } = await client.query(`SELECT * FROM cicli_fasi WHERE ciclo_id = $1 ORDER BY ordine`, [cicloPadreId]);
    for (const fase of fasi) {
      const { rows: nuovaFaseRows } = await client.query(
        `INSERT INTO cicli_fasi (ciclo_id, ordine, nome_fase, note) VALUES ($1,$2,$3,$4) RETURNING id`,
        [figlioId, fase.ordine, fase.nome_fase, fase.note]
      );
      const nuovaFaseId = nuovaFaseRows[0].id as string;
      const { rows: prodotti } = await client.query(`SELECT * FROM cicli_fasi_prodotti WHERE fase_id = $1`, [fase.id]);
      for (const p of prodotti) {
        await client.query(
          `INSERT INTO cicli_fasi_prodotti (fase_id, vernice_id, ruolo_in_fase, quantita, unita, note) VALUES ($1,$2,$3,$4,$5,$6)`,
          [nuovaFaseId, p.vernice_id, p.ruolo_in_fase, p.quantita, p.unita, p.note]
        );
      }
    }
    await client.query("COMMIT");
    return getCicloById(figlioId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Validazione vera e propria: lock sul ciclo, verifica strutturale (ogni fase ha almeno una
// vernice principale), calcolo warning TS/SDS non bloccanti, poi stato -> validato. Riusata sia
// dalla validazione manuale (validato_da_campionatura_id = null) sia dall'approvazione di una
// campionatura (che valida automaticamente il ciclo collegato) — vedi campionatureVerniciaturaRepository.
// Stato monotono: se il ciclo è già validato, non fa nulla e non ricalcola warning.
export async function validaCicloInTransazione(
  client: PoolClient,
  cicloId: string,
  campionaturaId: string | null
): Promise<string[]> {
  const { rows: cicloRows } = await client.query(`SELECT * FROM cicli WHERE id = $1 FOR UPDATE`, [cicloId]);
  if (cicloRows.length === 0) throw new Error(`Ciclo non trovato: ${cicloId}`);
  if (cicloRows[0].stato === "validato") return [];

  const { rows: fasiSenzaVernice } = await client.query(
    `SELECT cf.id, cf.nome_fase FROM cicli_fasi cf
     WHERE cf.ciclo_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM cicli_fasi_prodotti cfp WHERE cfp.fase_id = cf.id AND cfp.ruolo_in_fase = 'vernice'
       )`,
    [cicloId]
  );
  if (fasiSenzaVernice.length > 0) {
    const nomi = fasiSenzaVernice.map((f) => f.nome_fase || f.id).join(", ");
    throw new Error(`Impossibile validare: fasi senza vernice principale assegnata (${nomi})`);
  }

  const { rows: verniciUsate } = await client.query(
    `SELECT DISTINCT v.id, v.colore_codice, v.tipologia, v.ts_drive_file_id, v.sds_drive_file_id
     FROM cicli_fasi_prodotti cfp
     JOIN cicli_fasi cf ON cf.id = cfp.fase_id
     JOIN vernici v ON v.id = cfp.vernice_id
     WHERE cf.ciclo_id = $1`,
    [cicloId]
  );
  const warnings: string[] = [];
  for (const v of verniciUsate) {
    const nome = v.colore_codice || v.tipologia || v.id;
    if (!v.ts_drive_file_id) warnings.push(`Scheda tecnica mancante per la vernice "${nome}"`);
    if (!v.sds_drive_file_id) warnings.push(`Scheda di sicurezza mancante per la vernice "${nome}"`);
  }

  await client.query(
    `UPDATE cicli SET stato = 'validato', validato_at = now(), validato_da_campionatura_id = $2, updated_at = now() WHERE id = $1`,
    [cicloId, campionaturaId]
  );
  return warnings;
}

export async function valida(cicloId: string): Promise<{ ciclo: Ciclo; warnings: string[] }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const warnings = await validaCicloInTransazione(client, cicloId, null);
    await client.query("COMMIT");
    return { ciclo: await getCicloById(cicloId), warnings };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
