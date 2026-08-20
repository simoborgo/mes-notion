import { pool } from "./db";
import type { Fornitore } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): Fornitore {
  return { id: r.id, nome: r.nome, codiceOs1: r.codice_os1, email: r.email };
}

export async function getFornitori(): Promise<string[]> {
  const { rows } = await pool.query(`SELECT nome FROM fornitori ORDER BY nome`);
  return rows.map((r) => r.nome).filter(Boolean);
}

export async function getFornitoriList(): Promise<Fornitore[]> {
  const { rows } = await pool.query(`SELECT id, nome, codice_os1, email FROM fornitori ORDER BY nome`);
  return rows.map(mapRow);
}

export async function createFornitore(data: { nome: string; codiceOs1: string; email: string | null }): Promise<Fornitore> {
  const { rows } = await pool.query(
    `INSERT INTO fornitori (id, nome, codice_os1, email) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING *`,
    [data.nome, data.codiceOs1, data.email]
  );
  return mapRow(rows[0]);
}

export async function updateFornitore(id: string, data: { nome?: string; codiceOs1?: string; email?: string | null }): Promise<Fornitore> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (data.nome !== undefined) { sets.push(`nome = $${i++}`); values.push(data.nome); }
  if (data.codiceOs1 !== undefined) { sets.push(`codice_os1 = $${i++}`); values.push(data.codiceOs1); }
  if (data.email !== undefined) { sets.push(`email = $${i++}`); values.push(data.email); }
  sets.push(`aggiornato_il = now()`);
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE fornitori SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  return mapRow(rows[0]);
}

export async function getFornitoriMap(): Promise<Record<string, string>> {
  const { rows } = await pool.query(`SELECT id, nome FROM fornitori ORDER BY nome`);
  const map: Record<string, string> = {};
  rows.forEach((r) => { map[r.id] = r.nome; });
  return map;
}

export async function findFornitoreMatch(name: string, codiceOs1?: string | null): Promise<{ id: string; nome: string; matchType: "exact" | "partial" } | null> {
  const list = await getFornitoriList();

  // Il codice fornitore OS1 è una chiave stabile, immune a cambi di ragione sociale —
  // ha priorità sul match per nome quando presente sia sul fornitore che nella riga importata.
  const needleCode = codiceOs1?.trim();
  if (needleCode) {
    const byCode = list.find((f) => f.codiceOs1 && f.codiceOs1 === needleCode);
    if (byCode) return { id: byCode.id, nome: byCode.nome, matchType: "exact" };
  }

  if (!name) return null;
  const needle = name.trim().toLowerCase();
  const exact = list.find((f) => f.nome.toLowerCase() === needle);
  if (exact) return { ...exact, matchType: "exact" };
  const partial = list.find((f) => f.nome.toLowerCase().includes(needle) || needle.includes(f.nome.toLowerCase()));
  return partial ? { ...partial, matchType: "partial" } : null;
}

export async function findFornitoreIdByName(name: string): Promise<string | null> {
  const match = await findFornitoreMatch(name);
  return match?.id ?? null;
}
