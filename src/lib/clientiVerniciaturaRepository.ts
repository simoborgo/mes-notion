import { pool } from "./db";

export async function getClientiVerniciatura(): Promise<string[]> {
  const { rows } = await pool.query(`SELECT nome FROM clienti_verniciatura ORDER BY nome`);
  return rows.map((r) => r.nome as string);
}

// Crea il cliente se non esiste già (case-insensitive) e restituisce sempre la forma già
// salvata a DB — evita che "gucci" digitato a mano crei un duplicato accanto a "Gucci".
export async function ensureClienteVerniciaturaEsiste(nome: string): Promise<string> {
  const v = nome.trim();
  if (!v) throw new Error("Cliente obbligatorio");
  const { rows } = await pool.query(
    `INSERT INTO clienti_verniciatura (nome) VALUES ($1)
     ON CONFLICT (LOWER(nome)) DO NOTHING
     RETURNING nome`,
    [v]
  );
  if (rows[0]) return rows[0].nome as string;
  const esistente = await pool.query(`SELECT nome FROM clienti_verniciatura WHERE LOWER(nome) = LOWER($1)`, [v]);
  return esistente.rows[0].nome as string;
}
