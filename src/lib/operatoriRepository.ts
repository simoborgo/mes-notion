import { pool } from "./db";
import type { Operatore } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): Operatore {
  return {
    id: r.id,
    matricola: r.matricola,
    cognome: r.cognome,
    nome: r.nome,
    reparto: r.reparto,
    tipo: r.tipo,
    azienda: r.azienda,
    inForza: r.in_forza,
  };
}

// Operatori "in forza" — usati da Rilevamento Ore.
export async function getOperatori(): Promise<Operatore[]> {
  const { rows } = await pool.query(
    `SELECT * FROM operatori WHERE in_forza = true ORDER BY cognome ASC`
  );
  return rows.map(mapRow);
}

// Tutti gli operatori, inclusi quelli non più in forza — vista sola lettura in Parametri Reparto.
export async function getTuttiOperatori(): Promise<Operatore[]> {
  const { rows } = await pool.query(`SELECT * FROM operatori ORDER BY cognome ASC`);
  return rows.map(mapRow);
}

// CRUD Personale — stessa regola già in vigore su Notion: nessuna cancellazione reale,
// "rimuovere" un operatore significa sempre disattivarlo (inForza -> false), mai eliminare la riga
// (altrimenti si perderebbe il collegamento con lo storico ore già registrato per quella matricola,
// che in Postgres chiava per matricola TEXT, non per id).
export async function createOperatorePage(entry: {
  cognome: string; nome: string; reparto: string; tipo: string; azienda: string; inForza: boolean;
}): Promise<Operatore> {
  const { rows } = await pool.query(
    `INSERT INTO operatori (id, matricola, cognome, nome, reparto, tipo, azienda, in_forza)
     VALUES (gen_random_uuid(), 'DIP-' || LPAD(nextval('operatori_matricola_seq')::text, 4, '0'), $1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [entry.cognome, entry.nome, entry.reparto, entry.tipo, entry.azienda, entry.inForza],
  );
  return mapRow(rows[0]);
}

export async function updateOperatorePage(id: string, entry: Partial<{
  cognome: string; nome: string; reparto: string; tipo: string; azienda: string; inForza: boolean;
}>): Promise<Operatore> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (entry.cognome !== undefined) { sets.push(`cognome = $${i++}`); values.push(entry.cognome); }
  if (entry.nome !== undefined) { sets.push(`nome = $${i++}`); values.push(entry.nome); }
  if (entry.reparto !== undefined) { sets.push(`reparto = $${i++}`); values.push(entry.reparto); }
  if (entry.tipo !== undefined) { sets.push(`tipo = $${i++}`); values.push(entry.tipo); }
  if (entry.azienda !== undefined) { sets.push(`azienda = $${i++}`); values.push(entry.azienda); }
  if (entry.inForza !== undefined) { sets.push(`in_forza = $${i++}`); values.push(entry.inForza); }
  sets.push(`aggiornato_il = now()`);

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE operatori SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values,
  );
  if (rows.length === 0) throw new Error(`Operatore non trovato: ${id}`);
  return mapRow(rows[0]);
}
