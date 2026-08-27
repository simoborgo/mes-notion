import type { Pool, PoolClient } from "pg";
import { pool } from "./db";
import type { ProfiloMetallico, ProfiloMetallicoUpdate } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): ProfiloMetallico {
  return {
    id: r.id,
    codice: r.codice,
    tipoProfilo: r.tipo_profilo,
    materiale: r.materiale,
    sezione: r.sezione,
    lunghezzaMm: r.lunghezza_mm != null ? Number(r.lunghezza_mm) : null,
    finitura: r.finitura,
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

export interface ProfiliMetalliciFiltro {
  soloAttivi?: boolean;
  tipoProfilo?: string;
  materiale?: string;
  fornitore?: string;
  clienteRiferimento?: string;
}

export async function getProfiliMetallici(filtro: ProfiliMetalliciFiltro = {}): Promise<ProfiloMetallico[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (filtro.soloAttivi !== false) where.push(`attivo = true`);
  if (filtro.tipoProfilo) { where.push(`tipo_profilo ILIKE $${i++}`); values.push(`%${filtro.tipoProfilo}%`); }
  if (filtro.materiale) { where.push(`materiale ILIKE $${i++}`); values.push(`%${filtro.materiale}%`); }
  if (filtro.fornitore) { where.push(`fornitore ILIKE $${i++}`); values.push(`%${filtro.fornitore}%`); }
  if (filtro.clienteRiferimento) { where.push(`cliente_riferimento = $${i++}`); values.push(filtro.clienteRiferimento); }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT * FROM profili_metallici ${whereClause} ORDER BY tipo_profilo NULLS LAST, codice`,
    values
  );
  return rows.map(mapRow);
}

export async function getProfiloMetallicoById(id: string): Promise<ProfiloMetallico> {
  const { rows } = await pool.query(`SELECT * FROM profili_metallici WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`Profilo metallico non trovato: ${id}`);
  return mapRow(rows[0]);
}

export async function createProfiloMetallico(data: {
  codice?: string | null;
  tipoProfilo?: string | null;
  materiale?: string | null;
  sezione?: string | null;
  lunghezzaMm?: number | null;
  finitura?: string | null;
  colore?: string | null;
  fornitore?: string | null;
  codiceFornitore?: string | null;
  codiceInventario?: string | null;
  unitaMisura?: string | null;
  clienteRiferimento?: string | null;
  createdBy?: string | null;
}): Promise<ProfiloMetallico> {
  const { rows } = await pool.query(
    `INSERT INTO profili_metallici
       (codice, tipo_profilo, materiale, sezione, lunghezza_mm, finitura, colore,
        fornitore, codice_fornitore, codice_inventario, unita_misura, cliente_riferimento,
        created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
     RETURNING *`,
    [
      data.codice ?? null,
      data.tipoProfilo ?? null,
      data.materiale ?? null,
      data.sezione ?? null,
      data.lunghezzaMm ?? null,
      data.finitura ?? null,
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

export async function updateProfiloMetallico(id: string, data: ProfiloMetallicoUpdate & { updatedBy?: string | null }): Promise<ProfiloMetallico> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const campi: [keyof ProfiloMetallicoUpdate, string][] = [
    ["codice", "codice"],
    ["tipoProfilo", "tipo_profilo"],
    ["materiale", "materiale"],
    ["sezione", "sezione"],
    ["lunghezzaMm", "lunghezza_mm"],
    ["finitura", "finitura"],
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
    `UPDATE profili_metallici SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  if (rows.length === 0) throw new Error(`Profilo metallico non trovato: ${id}`);
  return mapRow(rows[0]);
}

export async function disattivaProfiloMetallico(id: string): Promise<void> {
  await updateProfiloMetallico(id, { attivo: false });
}

export async function aggiornaGiacenzaProfiloMetallico(id: string, giacenzaAttuale: number, executor: Pool | PoolClient = pool): Promise<void> {
  await executor.query(`UPDATE profili_metallici SET giacenza_attuale = $1, updated_at = now() WHERE id = $2`, [giacenzaAttuale, id]);
}

export async function segnalaMovimentoProfiloMetallico(id: string, executor: Pool | PoolClient = pool): Promise<void> {
  await executor.query(`UPDATE profili_metallici SET segnalata_uso_il = now() WHERE id = $1`, [id]);
}

export async function risolviSegnalazioneProfiloMetallico(id: string, executor: Pool | PoolClient = pool): Promise<void> {
  await executor.query(`UPDATE profili_metallici SET segnalata_uso_il = NULL WHERE id = $1`, [id]);
}
