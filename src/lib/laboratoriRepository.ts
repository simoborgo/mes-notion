import { pool } from "./db";
import type { Laboratorio } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): Laboratorio {
  return {
    id: r.id,
    nome: r.nome,
    note: r.note,
    attivo: r.attivo,
  };
}

export async function getLaboratori(soloAttivi = true): Promise<Laboratorio[]> {
  const { rows } = await pool.query(
    soloAttivi
      ? `SELECT * FROM laboratori WHERE attivo = true ORDER BY nome`
      : `SELECT * FROM laboratori ORDER BY nome`
  );
  return rows.map(mapRow);
}

export async function getLaboratorioById(id: string): Promise<Laboratorio> {
  const { rows } = await pool.query(`SELECT * FROM laboratori WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`Laboratorio/fornitore non trovato: ${id}`);
  return mapRow(rows[0]);
}

export async function createLaboratorio({ nome, note }: { nome: string; note?: string | null }): Promise<Laboratorio> {
  const { rows } = await pool.query(
    `INSERT INTO laboratori (nome, note) VALUES ($1, $2) RETURNING *`,
    [nome, note ?? null]
  );
  return mapRow(rows[0]);
}

export async function updateLaboratorio(
  id: string,
  data: { nome?: string; note?: string | null; attivo?: boolean }
): Promise<Laboratorio> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (data.nome !== undefined) { sets.push(`nome = $${i++}`); values.push(data.nome); }
  if (data.note !== undefined) { sets.push(`note = $${i++}`); values.push(data.note); }
  if (data.attivo !== undefined) { sets.push(`attivo = $${i++}`); values.push(data.attivo); }
  sets.push(`updated_at = now()`);

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE laboratori SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  if (rows.length === 0) throw new Error(`Laboratorio/fornitore non trovato: ${id}`);
  return mapRow(rows[0]);
}

// Soft delete: mai cancellazione reale (referenziato da vernici.fornitore_id/laboratorio_id).
export async function disattivaLaboratorio(id: string): Promise<void> {
  await updateLaboratorio(id, { attivo: false });
}
