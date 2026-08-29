import { pool } from "./db";
import type { Cassa, CassaUpdate, CassaSchedaRiga } from "./types";

async function caricaSchedeRighe(casseIds: string[]): Promise<Map<string, CassaSchedaRiga[]>> {
  const map = new Map<string, CassaSchedaRiga[]>();
  if (casseIds.length === 0) return map;
  const { rows } = await pool.query(
    `SELECT cassa_id, scheda_id, note FROM cassa_schede WHERE cassa_id = ANY($1)`,
    [casseIds]
  );
  for (const r of rows) {
    const arr = map.get(r.cassa_id) ?? [];
    arr.push({ schedaId: r.scheda_id, note: r.note });
    map.set(r.cassa_id, arr);
  }
  return map;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any, schedeMap: Map<string, CassaSchedaRiga[]>): Cassa {
  return {
    id: r.id,
    commessaId: r.commessa_id,
    numero: r.numero,
    descrizione: r.descrizione,
    stato: r.stato,
    note: r.note,
    schede: schedeMap.get(r.id) ?? [],
    creatoIl: new Date(r.creato_il).toISOString(),
    aggiornatoIl: new Date(r.aggiornato_il).toISOString(),
  };
}

async function mapRows(rows: unknown[]): Promise<Cassa[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rr = rows as any[];
  const schedeMap = await caricaSchedeRighe(rr.map(r => r.id));
  return rr.map(r => mapRow(r, schedeMap));
}

export async function getCasse(): Promise<Cassa[]> {
  const { rows } = await pool.query(`SELECT * FROM casse ORDER BY commessa_id, numero`);
  return mapRows(rows);
}

export async function getCasseByCommessa(commessaId: string): Promise<Cassa[]> {
  const { rows } = await pool.query(`SELECT * FROM casse WHERE commessa_id = $1 ORDER BY numero`, [commessaId]);
  return mapRows(rows);
}

export async function getCassaById(id: string): Promise<Cassa> {
  const { rows } = await pool.query(`SELECT * FROM casse WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`Cassa non trovata: ${id}`);
  return (await mapRows(rows))[0];
}

async function setSchedeRighe(cassaId: string, schede: CassaSchedaRiga[]): Promise<void> {
  await pool.query(`DELETE FROM cassa_schede WHERE cassa_id = $1`, [cassaId]);
  for (const { schedaId, note } of schede) {
    await pool.query(
      `INSERT INTO cassa_schede (cassa_id, scheda_id, note) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [cassaId, schedaId, note || ""]
    );
  }
}

export async function createCassa({
  commessaId,
  descrizione,
  note,
  schede,
}: {
  commessaId: string;
  descrizione?: string;
  note?: string;
  schede?: CassaSchedaRiga[];
}): Promise<Cassa> {
  const { rows } = await pool.query(
    `INSERT INTO casse (commessa_id, numero, descrizione, note)
     VALUES ($1, COALESCE((SELECT MAX(numero) FROM casse WHERE commessa_id = $1), 0) + 1, $2, $3)
     RETURNING id`,
    [commessaId, descrizione || "", note || ""]
  );
  const id = rows[0].id as string;
  if (schede && schede.length) await setSchedeRighe(id, schede);
  return getCassaById(id);
}

export async function updateCassa(id: string, data: CassaUpdate): Promise<Cassa> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (data.descrizione !== undefined) { sets.push(`descrizione = $${i++}`); values.push(data.descrizione || ""); }
  if (data.stato !== undefined) { sets.push(`stato = $${i++}`); values.push(data.stato); }
  if (data.note !== undefined) { sets.push(`note = $${i++}`); values.push(data.note || ""); }
  sets.push(`aggiornato_il = now()`);

  values.push(id);
  const { rows } = await pool.query(`UPDATE casse SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`, values);
  if (rows.length === 0) throw new Error(`Cassa non trovata: ${id}`);

  if (data.schede !== undefined) await setSchedeRighe(id, data.schede);

  return getCassaById(id);
}

export async function updateCassaStato(id: string, stato: string): Promise<void> {
  const { rowCount } = await pool.query(`UPDATE casse SET stato = $1, aggiornato_il = now() WHERE id = $2`, [stato, id]);
  if (rowCount === 0) throw new Error(`Cassa non trovata: ${id}`);
}

// Hard delete: a differenza di Carichi/Ritiri una Cassa non ha documenti/foto associati da
// conservare come storico, è solo un contenitore di pianificazione. Cascata su cassa_schede
// (ON DELETE CASCADE) — non tocca mai schede.stato: le Schede restano "Completato", semplicemente
// non più assegnate a nessuna cassa.
export async function deleteCassa(id: string): Promise<void> {
  await pool.query(`DELETE FROM casse WHERE id = $1`, [id]);
}
