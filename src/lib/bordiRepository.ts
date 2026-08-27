import type { Pool, PoolClient } from "pg";
import { pool } from "./db";
import type { Bordo, BordoUpdate } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): Bordo {
  return {
    id: r.id,
    codice: r.codice,
    decorCodice: r.decor_codice,
    decorNome: r.decor_nome,
    materiale: r.materiale,
    spessoreMm: r.spessore_mm != null ? Number(r.spessore_mm) : null,
    altezzaMm: r.altezza_mm != null ? Number(r.altezza_mm) : null,
    finitura: r.finitura,
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

export interface BordiFiltro {
  soloAttivi?: boolean;
  decorCodice?: string;
  materiale?: string;
  fornitore?: string;
  clienteRiferimento?: string;
}

export async function getBordi(filtro: BordiFiltro = {}): Promise<Bordo[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (filtro.soloAttivi !== false) where.push(`attivo = true`);
  if (filtro.decorCodice) { where.push(`decor_codice ILIKE $${i++}`); values.push(`%${filtro.decorCodice}%`); }
  if (filtro.materiale) { where.push(`materiale ILIKE $${i++}`); values.push(`%${filtro.materiale}%`); }
  if (filtro.fornitore) { where.push(`fornitore ILIKE $${i++}`); values.push(`%${filtro.fornitore}%`); }
  if (filtro.clienteRiferimento) { where.push(`cliente_riferimento = $${i++}`); values.push(filtro.clienteRiferimento); }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT * FROM bordi ${whereClause} ORDER BY decor_codice NULLS LAST, materiale`,
    values
  );
  return rows.map(mapRow);
}

export async function getBordoById(id: string): Promise<Bordo> {
  const { rows } = await pool.query(`SELECT * FROM bordi WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`Bordo non trovato: ${id}`);
  return mapRow(rows[0]);
}

export async function createBordo(data: {
  codice?: string | null;
  decorCodice?: string | null;
  decorNome?: string | null;
  materiale?: string | null;
  spessoreMm?: number | null;
  altezzaMm?: number | null;
  finitura?: string | null;
  fornitore?: string | null;
  codiceFornitore?: string | null;
  codiceInventario?: string | null;
  unitaMisura?: string | null;
  clienteRiferimento?: string | null;
  createdBy?: string | null;
}): Promise<Bordo> {
  const { rows } = await pool.query(
    `INSERT INTO bordi
       (codice, decor_codice, decor_nome, materiale, spessore_mm, altezza_mm, finitura,
        fornitore, codice_fornitore, codice_inventario, unita_misura, cliente_riferimento,
        created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
     RETURNING *`,
    [
      data.codice ?? null,
      data.decorCodice ?? null,
      data.decorNome ?? null,
      data.materiale ?? null,
      data.spessoreMm ?? null,
      data.altezzaMm ?? null,
      data.finitura ?? null,
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

export async function updateBordo(id: string, data: BordoUpdate & { updatedBy?: string | null }): Promise<Bordo> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const campi: [keyof BordoUpdate, string][] = [
    ["codice", "codice"],
    ["decorCodice", "decor_codice"],
    ["decorNome", "decor_nome"],
    ["materiale", "materiale"],
    ["spessoreMm", "spessore_mm"],
    ["altezzaMm", "altezza_mm"],
    ["finitura", "finitura"],
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
    `UPDATE bordi SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  if (rows.length === 0) throw new Error(`Bordo non trovato: ${id}`);
  return mapRow(rows[0]);
}

// Soft delete: mai cancellazione reale, stesso motivo di disattivaVernice (storico movimenti).
export async function disattivaBordo(id: string): Promise<void> {
  await updateBordo(id, { attivo: false });
}

// Scrittura giacenza separata da updateBordo/BordoUpdate: la giacenza si modifica solo tramite
// carico/scarico/rettifica (movimenti_magazzino), mai via update generico anagrafica.
export async function aggiornaGiacenzaBordo(id: string, giacenzaAttuale: number, executor: Pool | PoolClient = pool): Promise<void> {
  await executor.query(`UPDATE bordi SET giacenza_attuale = $1, updated_at = now() WHERE id = $2`, [giacenzaAttuale, id]);
}

// Marca il bordo come "movimentato, da verificare al prossimo inventario" — chiamata da
// qualsiasi movimento (carico o scarico, anche preciso). Si azzera solo con
// risolviSegnalazioneBordo, mai da un movimento successivo (stesso pattern di Vernici).
export async function segnalaMovimentoBordo(id: string, executor: Pool | PoolClient = pool): Promise<void> {
  await executor.query(`UPDATE bordi SET segnalata_uso_il = now() WHERE id = $1`, [id]);
}

// Chiamata solo dal conteggio in un inventario (unica verifica fisica che risolve il dubbio).
export async function risolviSegnalazioneBordo(id: string, executor: Pool | PoolClient = pool): Promise<void> {
  await executor.query(`UPDATE bordi SET segnalata_uso_il = NULL WHERE id = $1`, [id]);
}
