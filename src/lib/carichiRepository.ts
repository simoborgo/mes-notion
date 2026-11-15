import type { PoolClient } from "pg";
import { pool, dateToStr } from "./db";
import type { Carico, CaricoUpdate } from "./types";
import { STATI_CHIUSI_ODP } from "./types";
import { sottraiGiorniLavorativi } from "./calendarioLavorativo";

// Anticipo della produzione rispetto al carico: la data produzione prevista degli ODP è sempre
// "data carico − 5 giorni lavorativi" (deciso con l'utente 2026-10-07).
export const ANTICIPO_PRODUZIONE_GIORNI_LAVORATIVI = 5;

// Un ODP può stare in un solo carico: l'API la traduce in 409.
export class OdpGiaInCaricoError extends Error {}

// Spostamento non ammesso (carico spedito/inesistente, ODP di un'altra commessa): l'API la traduce in 400.
export class SpostamentoNonValidoError extends Error {}

type Queryable = Pick<PoolClient, "query">;

// "Documenti" era un allegato files genuino su Notion, ma senza alcun upload path nell'app
// attuale (solo letto in export CSV, mai scritto) — nessuna colonna Drive dedicata qui, solo il
// conteggio legacy per il fallback verso /api/files/[pageId], stesso pattern delle altre fasi.
function legacyFileUrl(pageId: string, prop: string, index: number): string {
  return `/api/files/${pageId}?prop=${encodeURIComponent(prop)}&index=${index}`;
}

async function caricaOdpIds(carichiIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (carichiIds.length === 0) return map;
  const { rows } = await pool.query(`SELECT carico_id, scheda_id FROM carichi_schede WHERE carico_id = ANY($1)`, [carichiIds]);
  for (const r of rows) {
    const arr = map.get(r.carico_id) ?? [];
    arr.push(r.scheda_id);
    map.set(r.carico_id, arr);
  }
  return map;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any, odpMap: Map<string, string[]>): Carico {
  const documenti = Array.from({ length: r.legacy_documenti_count ?? 0 }, (_, i) => ({ name: "Documenti", url: legacyFileUrl(r.id, "Documenti", i) }));
  return {
    id: r.id,
    titolo: r.titolo,
    descrizione: r.descrizione,
    dataCarico: r.data_carico ? dateToStr(r.data_carico) : null,
    commessaId: r.commessa_id,
    odpIds: odpMap.get(r.id) ?? [],
    modalita: r.modalita,
    stato: r.stato,
    documenti,
    notionUrl: "",
  };
}

async function mapRows(rows: unknown[]): Promise<Carico[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rr = rows as any[];
  const odpMap = await caricaOdpIds(rr.map(r => r.id));
  return rr.map(r => mapRow(r, odpMap));
}

export async function getCarichi(): Promise<Carico[]> {
  const { rows } = await pool.query(`SELECT * FROM carichi WHERE archiviato = false ORDER BY data_carico ASC NULLS LAST`);
  return mapRows(rows);
}

export async function getCarichiByCommessa(commessaId: string): Promise<Carico[]> {
  const { rows } = await pool.query(`SELECT * FROM carichi WHERE commessa_id = $1 AND archiviato = false`, [commessaId]);
  return mapRows(rows);
}

export async function getCaricoById(id: string): Promise<Carico> {
  const { rows } = await pool.query(`SELECT * FROM carichi WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`Carico non trovato: ${id}`);
  return (await mapRows(rows))[0];
}

async function setOdpIds(caricoId: string, odpIds: string[]): Promise<void> {
  await pool.query(`DELETE FROM carichi_schede WHERE carico_id = $1`, [caricoId]);
  for (const schedaId of odpIds) {
    await pool.query(`INSERT INTO carichi_schede (carico_id, scheda_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [caricoId, schedaId]);
  }
}

// Solo carichi non archiviati: un carico eliminato (soft-delete) lascia le sue righe in
// carichi_schede, quindi un vincolo UNIQUE a DB bloccherebbe ODP in realtà liberi.
async function verificaOdpLiberi(odpIds: string[], caricoIdCorrente: string | null): Promise<void> {
  if (odpIds.length === 0) return;
  const { rows } = await pool.query(
    `SELECT s.odp, k.titolo, k.data_carico
     FROM carichi_schede ks
     JOIN carichi k ON k.id = ks.carico_id AND k.archiviato = false
     JOIN schede s ON s.id = ks.scheda_id
     WHERE ks.scheda_id = ANY($1) AND ($2::uuid IS NULL OR ks.carico_id <> $2::uuid)`,
    [odpIds, caricoIdCorrente],
  );
  if (rows.length === 0) return;
  const elenco = rows
    .map(r => `${r.odp} è già nel carico «${r.titolo}»${r.data_carico ? ` (${new Date(dateToStr(r.data_carico)).toLocaleDateString("it-IT")})` : ""}`)
    .join("; ");
  throw new OdpGiaInCaricoError(`${elenco}. Un ODP può stare in un solo carico: toglilo prima dall'altro.`);
}

// Data produzione prevista = data carico − 5 gg lavorativi, solo sugli ODP aperti (gli ODP
// Completati/Annullati mantengono la data storica). Solo la colonna: nessun ricalcolo APS.
async function riallineaDataProduzione(schedaIds: string[], dataCarico: string | null, db: Queryable = pool): Promise<void> {
  if (schedaIds.length === 0 || !dataCarico) return;
  await db.query(
    `UPDATE schede SET data_produzione_prevista = $1, aggiornato_il = now()
     WHERE id = ANY($2) AND stato <> ALL($3)`,
    [sottraiGiorniLavorativi(dataCarico, ANTICIPO_PRODUZIONE_GIORNI_LAVORATIVI), schedaIds, STATI_CHIUSI_ODP],
  );
}

// id delle schede presenti in almeno un carico non archiviato (per segnalare quelle senza carico)
export async function getSchedaIdsInCarico(): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ks.scheda_id FROM carichi_schede ks JOIN carichi k ON k.id = ks.carico_id AND k.archiviato = false`,
  );
  return rows.map(r => r.scheda_id as string);
}

// scheda_id → data del carico (non archiviato) in cui sta. Con doppioni storici vale il carico più vicino.
export async function getDateCaricoPerScheda(): Promise<Record<string, string | null>> {
  const { rows } = await pool.query(
    `SELECT ks.scheda_id, k.data_carico FROM carichi_schede ks JOIN carichi k ON k.id = ks.carico_id AND k.archiviato = false
     ORDER BY k.data_carico DESC NULLS FIRST`,
  );
  const out: Record<string, string | null> = {};
  for (const r of rows) out[r.scheda_id] = r.data_carico ? dateToStr(r.data_carico) : null;
  return out;
}

// ODP presenti in più di un carico non archiviato (doppioni storici, ora impediti dal controllo)
export async function getOdpInPiuCarichi(): Promise<{ schedaId: string; carichi: { id: string; titolo: string; dataCarico: string | null }[] }[]> {
  const { rows } = await pool.query(
    `SELECT ks.scheda_id, k.id, k.titolo, k.data_carico
     FROM carichi_schede ks JOIN carichi k ON k.id = ks.carico_id AND k.archiviato = false
     WHERE ks.scheda_id IN (
       SELECT ks2.scheda_id FROM carichi_schede ks2 JOIN carichi k2 ON k2.id = ks2.carico_id AND k2.archiviato = false
       GROUP BY ks2.scheda_id HAVING COUNT(*) > 1)
     ORDER BY k.data_carico`,
  );
  const map = new Map<string, { id: string; titolo: string; dataCarico: string | null }[]>();
  for (const r of rows) {
    const arr = map.get(r.scheda_id) ?? [];
    arr.push({ id: r.id, titolo: r.titolo, dataCarico: r.data_carico ? dateToStr(r.data_carico) : null });
    map.set(r.scheda_id, arr);
  }
  return [...map.entries()].map(([schedaId, carichi]) => ({ schedaId, carichi }));
}

export async function createCarico({
  titolo,
  descrizione,
  dataCarico,
  commessaId,
  odpIds,
  modalita,
  stato,
}: {
  titolo: string;
  descrizione?: string;
  dataCarico: string;
  commessaId?: string | null;
  odpIds?: string[];
  modalita?: string;
  stato?: string;
}): Promise<Carico> {
  const odpUnici = [...new Set(odpIds ?? [])];
  await verificaOdpLiberi(odpUnici, null);
  const { rows } = await pool.query(
    `INSERT INTO carichi (id, titolo, descrizione, data_carico, commessa_id, modalita, stato)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, COALESCE($6,'Pianificato'))
     RETURNING id`,
    [titolo || "Carico", descrizione || "", dataCarico, commessaId || null, modalita || "", stato || null],
  );
  const id = rows[0].id as string;
  if (odpUnici.length) {
    await setOdpIds(id, odpUnici);
    await riallineaDataProduzione(odpUnici, dataCarico);
  }
  return getCaricoById(id);
}

export async function updateCarico(id: string, data: CaricoUpdate): Promise<Carico> {
  const prima = await getCaricoById(id);
  const odpNuovi = data.odpIds !== undefined ? [...new Set(data.odpIds)] : null;
  // Si controllano solo gli ODP aggiunti: un carico che contiene già un doppione storico resta
  // modificabile (i doppioni si sistemano dal report "ODP senza carico").
  const odpAggiunti = odpNuovi ? odpNuovi.filter(o => !prima.odpIds.includes(o)) : [];
  await verificaOdpLiberi(odpAggiunti, id);

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (data.titolo !== undefined) { sets.push(`titolo = $${i++}`); values.push(data.titolo); }
  if (data.descrizione !== undefined) { sets.push(`descrizione = $${i++}`); values.push(data.descrizione || ""); }
  if (data.dataCarico !== undefined) { sets.push(`data_carico = $${i++}`); values.push(data.dataCarico); }
  if (data.commessaId !== undefined) { sets.push(`commessa_id = $${i++}`); values.push(data.commessaId || null); }
  if (data.modalita !== undefined) { sets.push(`modalita = $${i++}`); values.push(data.modalita || ""); }
  if (data.stato !== undefined) { sets.push(`stato = $${i++}`); values.push(data.stato); }
  sets.push(`aggiornato_il = now()`);

  values.push(id);
  const { rows } = await pool.query(`UPDATE carichi SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`, values);
  if (rows.length === 0) throw new Error(`Carico non trovato: ${id}`);

  if (odpNuovi) await setOdpIds(id, odpNuovi);

  // ODP rimossi dal carico: la loro data resta com'è (vanno solo segnalati come "senza carico").
  const dataCambiata = data.dataCarico !== undefined && data.dataCarico !== prima.dataCarico;
  const odpDaRiallineare = dataCambiata ? (odpNuovi ?? prima.odpIds) : odpAggiunti;
  await riallineaDataProduzione(odpDaRiallineare, data.dataCarico ?? prima.dataCarico);

  return getCaricoById(id);
}

// Sposta delle schede (ODP o sottoschede) nel carico di destinazione, oppure le toglie da ogni
// carico (caricoDestId = null). Tutto in una transazione: l'ODP esce da qualunque carico non
// archiviato in cui si trova (doppioni storici compresi) ed entra nella destinazione, così non
// resta mai a metà strada. Entrando in un carico la data di produzione prevista degli ODP aperti
// si riallinea al carico; togliendolo la data resta quella che era (come updateCarico).
export async function spostaOdp(schedaIds: string[], caricoDestId: string | null): Promise<{ spostati: number; carico: { id: string; titolo: string; dataCarico: string | null } | null }> {
  const ids = [...new Set(schedaIds)];
  if (ids.length === 0) throw new SpostamentoNonValidoError("Nessun ODP selezionato.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let dest: { id: string; titolo: string; dataCarico: string | null; commessaId: string | null } | null = null;
    if (caricoDestId) {
      const { rows } = await client.query(
        `SELECT id, titolo, data_carico, commessa_id, stato FROM carichi WHERE id = $1 AND archiviato = false FOR UPDATE`,
        [caricoDestId],
      );
      if (rows.length === 0) throw new SpostamentoNonValidoError("Il carico di destinazione non esiste più: ricarica la pagina.");
      if (rows[0].stato === "Spedito") throw new SpostamentoNonValidoError(`Il carico «${rows[0].titolo}» è già spedito: non si possono aggiungere ODP.`);
      dest = { id: rows[0].id, titolo: rows[0].titolo, dataCarico: rows[0].data_carico ? dateToStr(rows[0].data_carico) : null, commessaId: rows[0].commessa_id };
    }

    // Commessa effettiva di ogni scheda: la propria o, per le sottoschede, quella del primo antenato che ce l'ha
    const { rows: schede } = await client.query(
      `WITH RECURSIVE catena AS (
         SELECT s.id AS origine, s.id, s.parent_id, s.commessa_id, 0 AS livello FROM schede s WHERE s.id = ANY($1)
         UNION ALL
         SELECT c.origine, p.id, p.parent_id, p.commessa_id, c.livello + 1
         FROM catena c JOIN schede p ON p.id = c.parent_id
         WHERE c.commessa_id IS NULL AND c.livello < 10
       )
       SELECT s.id, s.odp, s.numero_scheda, s.stato,
              (SELECT c.commessa_id FROM catena c WHERE c.origine = s.id AND c.commessa_id IS NOT NULL ORDER BY c.livello LIMIT 1) AS commessa_effettiva
       FROM schede s WHERE s.id = ANY($1) AND s.archiviata = false`,
      [ids],
    );
    if (schede.length !== ids.length) throw new SpostamentoNonValidoError("Alcuni ODP selezionati non esistono più: ricarica la pagina.");
    const annullati = schede.filter(s => s.stato === "Annullata");
    if (annullati.length) throw new SpostamentoNonValidoError(`${annullati.map(s => s.odp).join(", ")}: gli ODP annullati non vanno nei carichi.`);
    if (dest) {
      const altre = schede.filter(s => s.commessa_effettiva !== dest!.commessaId);
      if (altre.length) {
        throw new SpostamentoNonValidoError(`${altre.map(s => [s.odp, s.numero_scheda].filter(Boolean).join(" - ")).join(", ")}: ${altre.length === 1 ? "non appartiene" : "non appartengono"} alla commessa del carico «${dest.titolo}».`);
      }
    }

    await client.query(
      `DELETE FROM carichi_schede ks USING carichi k
       WHERE ks.carico_id = k.id AND k.archiviato = false AND ks.scheda_id = ANY($1)`,
      [ids],
    );
    if (dest) {
      await client.query(
        `INSERT INTO carichi_schede (carico_id, scheda_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
        [dest.id, ids],
      );
      await client.query(`UPDATE carichi SET aggiornato_il = now() WHERE id = $1`, [dest.id]);
      await riallineaDataProduzione(ids, dest.dataCarico, client);
    }

    await client.query("COMMIT");
    return { spostati: ids.length, carico: dest ? { id: dest.id, titolo: dest.titolo, dataCarico: dest.dataCarico } : null };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Soft-delete, stesso pattern già in uso su Notion (archived: true): la riga resta recuperabile
// via getCaricoById, sparisce solo dalle liste.
export async function deleteCarico(id: string): Promise<void> {
  await pool.query(`UPDATE carichi SET archiviato = true, aggiornato_il = now() WHERE id = $1`, [id]);
}
