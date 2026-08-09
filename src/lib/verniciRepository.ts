import { pool } from "./db";
import type { Vernice, VerniceUpdate } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): Vernice {
  return {
    id: r.id,
    coloreSistema: r.colore_sistema,
    coloreCodice: r.colore_codice,
    coloreNome: r.colore_nome,
    fornitoreId: r.fornitore_id,
    laboratorioId: r.laboratorio_id,
    codiceTintometro: r.codice_tintometro,
    codiceVendita: r.codice_vendita,
    codiceInventario: r.codice_inventario,
    unitaMisura: r.unita_misura,
    famigliaProdotto: r.famiglia_prodotto,
    ruolo: r.ruolo,
    finitura: r.finitura,
    gloss: r.gloss,
    tipoBilancioMassa: r.tipo_bilancio_massa,
    bilancioMassaRaw: r.bilancio_massa_raw,
    clienteRiferimento: r.cliente_riferimento,
    driveFolderId: r.drive_folder_id,
    tsDriveFileId: r.ts_drive_file_id,
    sdsDriveFileId: r.sds_drive_file_id,
    attivo: r.attivo,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export interface VerniciFiltro {
  soloAttivi?: boolean;
  coloreCodice?: string;
  fornitoreId?: string;
  famigliaProdotto?: string;
  ruolo?: string;
  tipoBilancioMassa?: string;
  clienteRiferimento?: string;
}

export async function getVernici(filtro: VerniciFiltro = {}): Promise<Vernice[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (filtro.soloAttivi !== false) where.push(`attivo = true`);
  if (filtro.coloreCodice) { where.push(`colore_codice ILIKE $${i++}`); values.push(`%${filtro.coloreCodice}%`); }
  if (filtro.fornitoreId) { where.push(`fornitore_id = $${i++}`); values.push(filtro.fornitoreId); }
  if (filtro.famigliaProdotto) { where.push(`famiglia_prodotto ILIKE $${i++}`); values.push(`%${filtro.famigliaProdotto}%`); }
  if (filtro.ruolo) { where.push(`ruolo = $${i++}`); values.push(filtro.ruolo); }
  if (filtro.tipoBilancioMassa) { where.push(`tipo_bilancio_massa = $${i++}`); values.push(filtro.tipoBilancioMassa); }
  if (filtro.clienteRiferimento) { where.push(`cliente_riferimento = $${i++}`); values.push(filtro.clienteRiferimento); }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT * FROM vernici ${whereClause} ORDER BY colore_codice NULLS LAST, famiglia_prodotto`,
    values
  );
  return rows.map(mapRow);
}

export async function getVerniceById(id: string): Promise<Vernice> {
  const { rows } = await pool.query(`SELECT * FROM vernici WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`Vernice non trovata: ${id}`);
  return mapRow(rows[0]);
}

export async function createVernice(data: {
  coloreSistema?: string | null;
  coloreCodice?: string | null;
  coloreNome?: string | null;
  fornitoreId?: string | null;
  laboratorioId?: string | null;
  codiceTintometro?: string | null;
  codiceVendita?: string | null;
  codiceInventario?: string | null;
  unitaMisura?: string | null;
  famigliaProdotto: string;
  ruolo?: string | null;
  finitura?: string | null;
  gloss?: string | null;
  tipoBilancioMassa?: string | null;
  bilancioMassaRaw?: string | null;
  clienteRiferimento?: string | null;
  createdBy?: string | null;
}): Promise<Vernice> {
  const { rows } = await pool.query(
    `INSERT INTO vernici
       (colore_sistema, colore_codice, colore_nome, fornitore_id, laboratorio_id, codice_tintometro,
        codice_vendita, codice_inventario, unita_misura, famiglia_prodotto, ruolo, finitura, gloss,
        tipo_bilancio_massa, bilancio_massa_raw, cliente_riferimento, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
     RETURNING *`,
    [
      data.coloreSistema ?? null,
      data.coloreCodice ?? null,
      data.coloreNome ?? null,
      data.fornitoreId ?? null,
      data.laboratorioId ?? null,
      data.codiceTintometro ?? null,
      data.codiceVendita ?? null,
      data.codiceInventario ?? null,
      data.unitaMisura ?? null,
      data.famigliaProdotto,
      data.ruolo ?? null,
      data.finitura ?? null,
      data.gloss ?? null,
      data.tipoBilancioMassa ?? null,
      data.bilancioMassaRaw ?? null,
      data.clienteRiferimento ?? null,
      data.createdBy ?? null,
    ]
  );
  return mapRow(rows[0]);
}

export async function updateVernice(id: string, data: VerniceUpdate & { updatedBy?: string | null }): Promise<Vernice> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const campi: [keyof VerniceUpdate, string][] = [
    ["coloreSistema", "colore_sistema"],
    ["coloreCodice", "colore_codice"],
    ["coloreNome", "colore_nome"],
    ["fornitoreId", "fornitore_id"],
    ["laboratorioId", "laboratorio_id"],
    ["codiceTintometro", "codice_tintometro"],
    ["codiceVendita", "codice_vendita"],
    ["codiceInventario", "codice_inventario"],
    ["unitaMisura", "unita_misura"],
    ["famigliaProdotto", "famiglia_prodotto"],
    ["ruolo", "ruolo"],
    ["finitura", "finitura"],
    ["gloss", "gloss"],
    ["tipoBilancioMassa", "tipo_bilancio_massa"],
    ["bilancioMassaRaw", "bilancio_massa_raw"],
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
    `UPDATE vernici SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  if (rows.length === 0) throw new Error(`Vernice non trovata: ${id}`);
  return mapRow(rows[0]);
}

// Soft delete: mai cancellazione reale (referenziata da cicli_fasi_prodotti).
export async function disattivaVernice(id: string): Promise<void> {
  await updateVernice(id, { attivo: false });
}

export async function setVerniceDriveFolderId(id: string, driveFolderId: string): Promise<void> {
  await pool.query(`UPDATE vernici SET drive_folder_id = $1, updated_at = now() WHERE id = $2`, [driveFolderId, id]);
}

export async function setVerniceTsDocumento(id: string, driveFileId: string): Promise<void> {
  await pool.query(`UPDATE vernici SET ts_drive_file_id = $1, updated_at = now() WHERE id = $2`, [driveFileId, id]);
}

export async function setVerniceSdsDocumento(id: string, driveFileId: string): Promise<void> {
  await pool.query(`UPDATE vernici SET sds_drive_file_id = $1, updated_at = now() WHERE id = $2`, [driveFileId, id]);
}
