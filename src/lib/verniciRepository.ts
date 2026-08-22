import type { Pool, PoolClient } from "pg";
import { pool } from "./db";
import type { Vernice, VerniceUpdate } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): Vernice {
  return {
    id: r.id,
    coloreCodice: r.colore_codice,
    descrizioneColore: r.descrizione_colore,
    fornitore: r.fornitore,
    codiceTintometro: r.codice_tintometro,
    codiceVendita: r.codice_vendita,
    codiceInventario: r.codice_inventario,
    giacenzaAttuale: Number(r.giacenza_attuale),
    unitaMisura: r.unita_misura,
    tipologia: r.tipologia,
    finitura: r.finitura,
    gloss: r.gloss,
    tipoBilancioMassa: r.tipo_bilancio_massa,
    bilancioMassaRaw: r.bilancio_massa_raw,
    clienteRiferimento: r.cliente_riferimento,
    driveFolderId: r.drive_folder_id,
    tsDriveFileId: r.ts_drive_file_id,
    sdsDriveFileId: r.sds_drive_file_id,
    attivo: r.attivo,
    segnalataUsoIl: r.segnalata_uso_il ? new Date(r.segnalata_uso_il).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export interface VerniciFiltro {
  soloAttivi?: boolean;
  coloreCodice?: string;
  fornitore?: string;
  tipologia?: string;
  tipoBilancioMassa?: string;
  clienteRiferimento?: string;
}

export async function getVernici(filtro: VerniciFiltro = {}): Promise<Vernice[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (filtro.soloAttivi !== false) where.push(`attivo = true`);
  if (filtro.coloreCodice) { where.push(`colore_codice ILIKE $${i++}`); values.push(`%${filtro.coloreCodice}%`); }
  if (filtro.fornitore) { where.push(`fornitore ILIKE $${i++}`); values.push(`%${filtro.fornitore}%`); }
  if (filtro.tipologia) { where.push(`tipologia ILIKE $${i++}`); values.push(`%${filtro.tipologia}%`); }
  if (filtro.tipoBilancioMassa) { where.push(`tipo_bilancio_massa = $${i++}`); values.push(filtro.tipoBilancioMassa); }
  if (filtro.clienteRiferimento) { where.push(`cliente_riferimento = $${i++}`); values.push(filtro.clienteRiferimento); }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT * FROM vernici ${whereClause} ORDER BY colore_codice NULLS LAST, tipologia`,
    values
  );
  return rows.map(mapRow);
}

export async function getVerniceById(id: string): Promise<Vernice> {
  const { rows } = await pool.query(`SELECT * FROM vernici WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`Vernice non trovata: ${id}`);
  return mapRow(rows[0]);
}

// Usato dalla pagina di scan QR (il QR stampato codifica il Codice Inventario, non l'id
// Postgres — scelta esplicita dell'utente per la stampa in batch da Zebra, 2026-08-22).
// Univoco per vincolo DB (uq_vernici_codice_inventario), quindi al massimo una riga.
export async function getVerniceByCodiceInventario(codiceInventario: string): Promise<Vernice> {
  const { rows } = await pool.query(`SELECT * FROM vernici WHERE codice_inventario = $1`, [codiceInventario]);
  if (rows.length === 0) throw new Error(`Vernice non trovata per Codice Inventario: ${codiceInventario}`);
  return mapRow(rows[0]);
}

export async function createVernice(data: {
  coloreCodice?: string | null;
  descrizioneColore?: string | null;
  fornitore?: string | null;
  codiceTintometro?: string | null;
  codiceVendita?: string | null;
  codiceInventario?: string | null;
  unitaMisura?: string | null;
  tipologia: string;
  finitura?: string | null;
  gloss?: string | null;
  tipoBilancioMassa?: string | null;
  bilancioMassaRaw?: string | null;
  clienteRiferimento?: string | null;
  createdBy?: string | null;
}): Promise<Vernice> {
  const { rows } = await pool.query(
    `INSERT INTO vernici
       (colore_codice, descrizione_colore, fornitore, codice_tintometro,
        codice_vendita, codice_inventario, unita_misura, tipologia, finitura, gloss,
        tipo_bilancio_massa, bilancio_massa_raw, cliente_riferimento, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
     RETURNING *`,
    [
      data.coloreCodice ?? null,
      data.descrizioneColore ?? null,
      data.fornitore ?? null,
      data.codiceTintometro ?? null,
      data.codiceVendita ?? null,
      data.codiceInventario ?? null,
      data.unitaMisura ?? null,
      data.tipologia,
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
    ["coloreCodice", "colore_codice"],
    ["descrizioneColore", "descrizione_colore"],
    ["fornitore", "fornitore"],
    ["codiceTintometro", "codice_tintometro"],
    ["codiceVendita", "codice_vendita"],
    ["codiceInventario", "codice_inventario"],
    ["unitaMisura", "unita_misura"],
    ["tipologia", "tipologia"],
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

// Scrittura giacenza separata da updateVernice/VerniceUpdate: la giacenza si modifica solo
// tramite carico/scarico/rettifica (movimenti_magazzino), mai via update generico anagrafica.
export async function aggiornaGiacenzaVernice(id: string, giacenzaAttuale: number, executor: Pool | PoolClient = pool): Promise<void> {
  await executor.query(`UPDATE vernici SET giacenza_attuale = $1, updated_at = now() WHERE id = $2`, [giacenzaAttuale, id]);
}

// Marca la vernice come "movimentata, da verificare al prossimo inventario" — chiamata da
// QUALSIASI movimento (segnalazione leggera senza peso, o un vero carico/scarico anche preciso:
// è comunque un segnale che si è mossa). Si azzera solo con risolviSegnalazioneVernice, mai da
// un movimento successivo.
export async function segnalaMovimentoVernice(id: string, executor: Pool | PoolClient = pool): Promise<void> {
  await executor.query(`UPDATE vernici SET segnalata_uso_il = now() WHERE id = $1`, [id]);
}

// Chiamata solo dal conteggio in un inventario (unica verifica fisica che risolve il dubbio).
export async function risolviSegnalazioneVernice(id: string, executor: Pool | PoolClient = pool): Promise<void> {
  await executor.query(`UPDATE vernici SET segnalata_uso_il = NULL WHERE id = $1`, [id]);
}
