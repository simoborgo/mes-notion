import type { Pool, PoolClient } from "pg";
import { pool } from "./db";
import type { ArticoloElettrico, ArticoloElettricoUpdate } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): ArticoloElettrico {
  return {
    id: r.id,
    codice: r.codice,
    tipoArticolo: r.tipo_articolo,
    marca: r.marca,
    caratteristiche: r.caratteristiche,
    descrizione: r.descrizione,
    colore: r.colore,
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

export interface MaterialeElettricoFiltro {
  soloAttivi?: boolean;
  tipoArticolo?: string;
  marca?: string;
  fornitore?: string;
  clienteRiferimento?: string;
}

export async function getMaterialeElettrico(filtro: MaterialeElettricoFiltro = {}): Promise<ArticoloElettrico[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (filtro.soloAttivi !== false) where.push(`attivo = true`);
  if (filtro.tipoArticolo) { where.push(`tipo_articolo ILIKE $${i++}`); values.push(`%${filtro.tipoArticolo}%`); }
  if (filtro.marca) { where.push(`marca ILIKE $${i++}`); values.push(`%${filtro.marca}%`); }
  if (filtro.fornitore) { where.push(`fornitore ILIKE $${i++}`); values.push(`%${filtro.fornitore}%`); }
  if (filtro.clienteRiferimento) { where.push(`cliente_riferimento = $${i++}`); values.push(filtro.clienteRiferimento); }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT * FROM materiale_elettrico ${whereClause} ORDER BY tipo_articolo NULLS LAST, codice`,
    values
  );
  return rows.map(mapRow);
}

export async function getArticoloElettricoById(id: string): Promise<ArticoloElettrico> {
  const { rows } = await pool.query(`SELECT * FROM materiale_elettrico WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`Articolo elettrico non trovato: ${id}`);
  return mapRow(rows[0]);
}

export async function createArticoloElettrico(data: {
  codice?: string | null;
  tipoArticolo?: string | null;
  marca?: string | null;
  caratteristiche?: string | null;
  descrizione?: string | null;
  colore?: string | null;
  fornitore?: string | null;
  codiceFornitore?: string | null;
  codiceInventario?: string | null;
  unitaMisura?: string | null;
  clienteRiferimento?: string | null;
  createdBy?: string | null;
}): Promise<ArticoloElettrico> {
  const { rows } = await pool.query(
    `INSERT INTO materiale_elettrico
       (codice, tipo_articolo, marca, caratteristiche, descrizione, colore,
        fornitore, codice_fornitore, codice_inventario, unita_misura, cliente_riferimento,
        created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
     RETURNING *`,
    [
      data.codice ?? null,
      data.tipoArticolo ?? null,
      data.marca ?? null,
      data.caratteristiche ?? null,
      data.descrizione ?? null,
      data.colore ?? null,
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

export async function updateArticoloElettrico(id: string, data: ArticoloElettricoUpdate & { updatedBy?: string | null }): Promise<ArticoloElettrico> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const campi: [keyof ArticoloElettricoUpdate, string][] = [
    ["codice", "codice"],
    ["tipoArticolo", "tipo_articolo"],
    ["marca", "marca"],
    ["caratteristiche", "caratteristiche"],
    ["descrizione", "descrizione"],
    ["colore", "colore"],
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
    `UPDATE materiale_elettrico SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  if (rows.length === 0) throw new Error(`Articolo elettrico non trovato: ${id}`);
  return mapRow(rows[0]);
}

export async function disattivaArticoloElettrico(id: string): Promise<void> {
  await updateArticoloElettrico(id, { attivo: false });
}

export async function aggiornaGiacenzaArticoloElettrico(id: string, giacenzaAttuale: number, executor: Pool | PoolClient = pool): Promise<void> {
  await executor.query(`UPDATE materiale_elettrico SET giacenza_attuale = $1, updated_at = now() WHERE id = $2`, [giacenzaAttuale, id]);
}

export async function segnalaMovimentoArticoloElettrico(id: string, executor: Pool | PoolClient = pool): Promise<void> {
  await executor.query(`UPDATE materiale_elettrico SET segnalata_uso_il = now() WHERE id = $1`, [id]);
}

export async function risolviSegnalazioneArticoloElettrico(id: string, executor: Pool | PoolClient = pool): Promise<void> {
  await executor.query(`UPDATE materiale_elettrico SET segnalata_uso_il = NULL WHERE id = $1`, [id]);
}
