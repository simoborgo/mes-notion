import type { Pool, PoolClient } from "pg";
import { pool } from "./db";
import type { Legno, LegnoUpdate } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): Legno {
  return {
    id: r.id,
    codice: r.codice,
    essenza: r.essenza,
    qualita: r.qualita,
    spessoreMm: r.spessore_mm != null ? Number(r.spessore_mm) : null,
    larghezzaMm: r.larghezza_mm != null ? Number(r.larghezza_mm) : null,
    lunghezzaMm: r.lunghezza_mm != null ? Number(r.lunghezza_mm) : null,
    fornitore: r.fornitore,
    codiceFornitore: r.codice_fornitore,
    codiceInventario: r.codice_inventario,
    giacenzaAttuale: Number(r.giacenza_attuale),
    unitaMisura: r.unita_misura,
    clienteRiferimento: r.cliente_riferimento,
    attivo: r.attivo,
    segnalataUsoIl: r.segnalata_uso_il ? new Date(r.segnalata_uso_il).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export interface LegniFiltro {
  soloAttivi?: boolean;
  essenza?: string;
  fornitore?: string;
  clienteRiferimento?: string;
}

export async function getLegni(filtro: LegniFiltro = {}): Promise<Legno[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (filtro.soloAttivi !== false) where.push(`attivo = true`);
  if (filtro.essenza) { where.push(`essenza ILIKE $${i++}`); values.push(`%${filtro.essenza}%`); }
  if (filtro.fornitore) { where.push(`fornitore ILIKE $${i++}`); values.push(`%${filtro.fornitore}%`); }
  if (filtro.clienteRiferimento) { where.push(`cliente_riferimento = $${i++}`); values.push(filtro.clienteRiferimento); }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT * FROM legni ${whereClause} ORDER BY essenza NULLS LAST, codice`,
    values
  );
  return rows.map(mapRow);
}

export async function getLegnoById(id: string): Promise<Legno> {
  const { rows } = await pool.query(`SELECT * FROM legni WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`Legno non trovato: ${id}`);
  return mapRow(rows[0]);
}

export async function createLegno(data: {
  codice?: string | null;
  essenza?: string | null;
  qualita?: string | null;
  spessoreMm?: number | null;
  larghezzaMm?: number | null;
  lunghezzaMm?: number | null;
  fornitore?: string | null;
  codiceFornitore?: string | null;
  codiceInventario?: string | null;
  unitaMisura?: string | null;
  clienteRiferimento?: string | null;
  createdBy?: string | null;
}): Promise<Legno> {
  const { rows } = await pool.query(
    `INSERT INTO legni
       (codice, essenza, qualita, spessore_mm, larghezza_mm, lunghezza_mm,
        fornitore, codice_fornitore, codice_inventario, unita_misura, cliente_riferimento,
        created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
     RETURNING *`,
    [
      data.codice ?? null,
      data.essenza ?? null,
      data.qualita ?? null,
      data.spessoreMm ?? null,
      data.larghezzaMm ?? null,
      data.lunghezzaMm ?? null,
      data.fornitore ?? null,
      data.codiceFornitore ?? null,
      data.codiceInventario ?? null,
      data.unitaMisura ?? null,
      data.clienteRiferimento ?? null,
      data.createdBy ?? null,
    ]
  );
  return mapRow(rows[0]);
}

export async function updateLegno(id: string, data: LegnoUpdate & { updatedBy?: string | null }): Promise<Legno> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const campi: [keyof LegnoUpdate, string][] = [
    ["codice", "codice"],
    ["essenza", "essenza"],
    ["qualita", "qualita"],
    ["spessoreMm", "spessore_mm"],
    ["larghezzaMm", "larghezza_mm"],
    ["lunghezzaMm", "lunghezza_mm"],
    ["fornitore", "fornitore"],
    ["codiceFornitore", "codice_fornitore"],
    ["codiceInventario", "codice_inventario"],
    ["unitaMisura", "unita_misura"],
    ["clienteRiferimento", "cliente_riferimento"],
    ["attivo", "attivo"],
  ];
  for (const [chiave, colonna] of campi) {
    if (data[chiave] !== undefined) { sets.push(`${colonna} = $${i++}`); values.push(data[chiave]); }
  }
  if (data.updatedBy !== undefined) { sets.push(`updated_by = $${i++}`); values.push(data.updatedBy); }
  sets.push(`updated_at = now()`);

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE legni SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  if (rows.length === 0) throw new Error(`Legno non trovato: ${id}`);
  return mapRow(rows[0]);
}

export async function disattivaLegno(id: string): Promise<void> {
  await updateLegno(id, { attivo: false });
}

export async function aggiornaGiacenzaLegno(id: string, giacenzaAttuale: number, executor: Pool | PoolClient = pool): Promise<void> {
  await executor.query(`UPDATE legni SET giacenza_attuale = $1, updated_at = now() WHERE id = $2`, [giacenzaAttuale, id]);
}

export async function segnalaMovimentoLegno(id: string, executor: Pool | PoolClient = pool): Promise<void> {
  await executor.query(`UPDATE legni SET segnalata_uso_il = now() WHERE id = $1`, [id]);
}

export async function risolviSegnalazioneLegno(id: string, executor: Pool | PoolClient = pool): Promise<void> {
  await executor.query(`UPDATE legni SET segnalata_uso_il = NULL WHERE id = $1`, [id]);
}
