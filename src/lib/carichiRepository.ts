import { pool, dateToStr } from "./db";
import type { Carico, CaricoUpdate } from "./types";

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
  const { rows } = await pool.query(
    `INSERT INTO carichi (id, titolo, descrizione, data_carico, commessa_id, modalita, stato)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, COALESCE($6,'Pianificato'))
     RETURNING id`,
    [titolo || "Carico", descrizione || "", dataCarico, commessaId || null, modalita || "", stato || null],
  );
  const id = rows[0].id as string;
  if (odpIds && odpIds.length) await setOdpIds(id, odpIds);
  return getCaricoById(id);
}

export async function updateCarico(id: string, data: CaricoUpdate): Promise<Carico> {
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

  if (data.odpIds !== undefined) await setOdpIds(id, data.odpIds);

  return getCaricoById(id);
}

// Soft-delete, stesso pattern già in uso su Notion (archived: true): la riga resta recuperabile
// via getCaricoById, sparisce solo dalle liste.
export async function deleteCarico(id: string): Promise<void> {
  await pool.query(`UPDATE carichi SET archiviato = true, aggiornato_il = now() WHERE id = $1`, [id]);
}
