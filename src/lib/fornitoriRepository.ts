import { pool } from "./db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): { id: string; nome: string; codiceOs1: string } {
  return { id: r.id, nome: r.nome, codiceOs1: r.codice_os1 };
}

export async function getFornitori(): Promise<string[]> {
  const { rows } = await pool.query(`SELECT nome FROM fornitori ORDER BY nome`);
  return rows.map((r) => r.nome).filter(Boolean);
}

export async function getFornitoriList(): Promise<{ id: string; nome: string; codiceOs1: string }[]> {
  const { rows } = await pool.query(`SELECT id, nome, codice_os1 FROM fornitori ORDER BY nome`);
  return rows.map(mapRow);
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
