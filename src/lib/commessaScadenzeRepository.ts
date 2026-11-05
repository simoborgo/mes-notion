import { pool } from "./db";
import type { CommessaScadenza, StatoScadenza } from "./types";

const SELECT = `SELECT c.*, s.odp AS odp FROM commessa_scadenze c LEFT JOIN schede s ON s.id = c.scheda_id`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): CommessaScadenza {
  return {
    id: r.id,
    commessaId: r.commessa_id,
    schedaId: r.scheda_id,
    odp: r.odp ?? null,
    titolo: r.titolo,
    scadenza: typeof r.scadenza === "string" ? r.scadenza.slice(0, 10) : new Date(r.scadenza.getTime() - r.scadenza.getTimezoneOffset() * 60000).toISOString().slice(0, 10),
    stato: r.stato,
    fattaIl: r.fatta_il ? new Date(r.fatta_il).toISOString() : null,
    fonte: r.fonte,
    creatoDa: r.creato_da,
    creatoIl: new Date(r.creato_il).toISOString(),
  };
}

export async function getScadenzeByCommessa(commessaId: string): Promise<CommessaScadenza[]> {
  const { rows } = await pool.query(`${SELECT} WHERE c.commessa_id = $1 ORDER BY (c.stato = 'fatta'), c.scadenza, c.creato_il`, [commessaId]);
  return rows.map(mapRow);
}

// Scadenze aperte legate a un ODP (lista "Scadenze collegate" nella scheda ODP).
export async function getScadenzeApertePerScheda(schedaId: string): Promise<CommessaScadenza[]> {
  const { rows } = await pool.query(`${SELECT} WHERE c.scheda_id = $1 AND c.stato = 'aperta' ORDER BY c.scadenza`, [schedaId]);
  return rows.map(mapRow);
}

export async function getScadenzaById(id: string): Promise<CommessaScadenza | null> {
  const { rows } = await pool.query(`${SELECT} WHERE c.id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createScadenza(data: {
  commessaId: string; schedaId?: string | null; titolo: string; scadenza: string; fonte?: "manuale" | "telegram"; creatoDa: string;
}): Promise<CommessaScadenza> {
  const { rows } = await pool.query(
    `INSERT INTO commessa_scadenze (commessa_id, scheda_id, titolo, scadenza, fonte, creato_da)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [data.commessaId, data.schedaId ?? null, data.titolo, data.scadenza, data.fonte ?? "manuale", data.creatoDa],
  );
  return (await getScadenzaById(rows[0].id))!;
}

export async function updateScadenza(
  id: string,
  data: { titolo?: string; scadenza?: string; schedaId?: string | null; stato?: StatoScadenza },
): Promise<CommessaScadenza> {
  const { rows } = await pool.query(
    `UPDATE commessa_scadenze SET
       titolo = COALESCE($2, titolo), scadenza = COALESCE($3, scadenza),
       scheda_id = CASE WHEN $4::boolean THEN $5::uuid ELSE scheda_id END,
       stato = COALESCE($6, stato),
       fatta_il = CASE WHEN $6 = 'fatta' THEN COALESCE(fatta_il, now()) WHEN $6 = 'aperta' THEN NULL ELSE fatta_il END
     WHERE id = $1 RETURNING id`,
    [id, data.titolo ?? null, data.scadenza ?? null, data.schedaId !== undefined, data.schedaId ?? null, data.stato ?? null],
  );
  if (rows.length === 0) throw new Error(`Scadenza non trovata: ${id}`);
  return (await getScadenzaById(id))!;
}

export async function deleteScadenza(id: string): Promise<void> {
  await pool.query(`DELETE FROM commessa_scadenze WHERE id = $1`, [id]);
}

// L'ODP deve appartenere alla commessa: evita collegamenti incrociati.
export async function schedaDellaCommessa(schedaId: string, commessaId: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM schede WHERE id = $1 AND commessa_id = $2`, [schedaId, commessaId]);
  return rows.length > 0;
}
