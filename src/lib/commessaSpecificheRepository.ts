import { pool } from "./db";
import type { CommessaSpecifica, TipoSpecifica, StatoSpecifica } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): CommessaSpecifica {
  return {
    id: r.id,
    commessaId: r.commessa_id,
    tipo: r.tipo,
    titolo: r.titolo,
    descrizione: r.descrizione,
    stato: r.stato,
    creatoDa: r.creato_da,
    creatoIl: new Date(r.creato_il).toISOString(),
    aggiornatoIl: new Date(r.aggiornato_il).toISOString(),
  };
}

export async function getSpecificheByCommessa(commessaId: string): Promise<CommessaSpecifica[]> {
  const { rows } = await pool.query(
    `SELECT * FROM commessa_specifiche WHERE commessa_id = $1 ORDER BY creato_il`,
    [commessaId],
  );
  return rows.map(mapRow);
}

export async function getSpecificaById(id: string): Promise<CommessaSpecifica | null> {
  const { rows } = await pool.query(`SELECT * FROM commessa_specifiche WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createSpecifica(data: {
  commessaId: string;
  tipo: TipoSpecifica;
  titolo: string;
  descrizione?: string;
  stato?: StatoSpecifica;
  creatoDa: string;
}): Promise<CommessaSpecifica> {
  const { rows } = await pool.query(
    `INSERT INTO commessa_specifiche (commessa_id, tipo, titolo, descrizione, stato, creato_da)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'Da confermare'), $6) RETURNING *`,
    [data.commessaId, data.tipo, data.titolo, data.descrizione ?? "", data.stato ?? null, data.creatoDa],
  );
  return mapRow(rows[0]);
}

export async function updateSpecifica(
  id: string,
  data: { tipo?: TipoSpecifica; titolo?: string; descrizione?: string; stato?: StatoSpecifica },
): Promise<CommessaSpecifica> {
  const { rows } = await pool.query(
    `UPDATE commessa_specifiche SET
       tipo = COALESCE($2, tipo), titolo = COALESCE($3, titolo),
       descrizione = COALESCE($4, descrizione), stato = COALESCE($5, stato),
       aggiornato_il = now()
     WHERE id = $1 RETURNING *`,
    [id, data.tipo ?? null, data.titolo ?? null, data.descrizione ?? null, data.stato ?? null],
  );
  if (rows.length === 0) throw new Error(`Specifica non trovata: ${id}`);
  return mapRow(rows[0]);
}

export async function deleteSpecifica(id: string): Promise<void> {
  await pool.query(`DELETE FROM commessa_specifiche WHERE id = $1`, [id]);
}
