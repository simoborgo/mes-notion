import { pool } from "./db";
import type { CommessaPianta, ZonaPianta } from "./types";
import { decodeBase64File } from "./schedeRepository";
import { cartellaDocumenti } from "./commessaAllegatiRepository";
import { uploadAllegato as driveUploadAllegato, deleteDriveFile } from "./googleDriveSchede";

// Mai SELECT *: la miniatura (bytea) non deve viaggiare con ogni elenco.
const COLONNE = `id, commessa_id, etichetta, ordine, nome_file, mime_type, drive_file_id, caricato_da, creato_il, aggiornato_il, (anteprima IS NOT NULL) AS ha_anteprima, (vista IS NOT NULL) AS ha_vista, pdf_segnato_drive_id, pdf_segnato_il`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): CommessaPianta {
  return {
    id: r.id,
    commessaId: r.commessa_id,
    etichetta: r.etichetta,
    ordine: r.ordine,
    nomeFile: r.nome_file,
    mimeType: r.mime_type,
    driveFileId: r.drive_file_id,
    caricatoDa: r.caricato_da,
    aggiornatoIl: new Date(r.aggiornato_il).toISOString(),
    haAnteprima: r.ha_anteprima,
    haVista: r.ha_vista,
    pdfSegnatoDriveId: r.pdf_segnato_drive_id,
    pdfSegnatoIl: r.pdf_segnato_il ? new Date(r.pdf_segnato_il).toISOString() : null,
  };
}

export async function getPianteByCommessa(commessaId: string): Promise<CommessaPianta[]> {
  const { rows } = await pool.query(`SELECT ${COLONNE} FROM commessa_piante WHERE commessa_id = $1 ORDER BY ordine, creato_il`, [commessaId]);
  return rows.map(mapRow);
}

export async function getPiantaById(id: string): Promise<CommessaPianta | null> {
  const { rows } = await pool.query(`SELECT ${COLONNE} FROM commessa_piante WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

async function caricaSuDrive(commessaId: string, fileBase64: string, filename: string) {
  const { buffer, mimeType } = decodeBase64File(fileBase64);
  const folderId = await cartellaDocumenti(commessaId);
  const uploaded = await driveUploadAllegato(folderId, buffer, filename, mimeType);
  return { driveFileId: uploaded.id, mimeType };
}

export async function addPianta(data: {
  commessaId: string; etichetta: string; fileBase64: string; filename: string; caricatoDa: string;
}): Promise<CommessaPianta> {
  const { driveFileId, mimeType } = await caricaSuDrive(data.commessaId, data.fileBase64, data.filename);
  const { rows } = await pool.query(
    `INSERT INTO commessa_piante (commessa_id, etichetta, ordine, nome_file, mime_type, drive_file_id, caricato_da)
     VALUES ($1,$2,(SELECT COALESCE(MAX(ordine), -1) + 1 FROM commessa_piante WHERE commessa_id = $1),$3,$4,$5,$6) RETURNING ${COLONNE}`,
    [data.commessaId, data.etichetta, data.filename, mimeType, driveFileId, data.caricatoDa],
  );
  return mapRow(rows[0]);
}

// Sostituisce il file mantenendo riga, etichetta e ordine (e, in futuro, le zone disegnate).
// Il vecchio file su Drive viene rimosso solo dopo che la riga punta al nuovo.
export async function sostituisciFilePianta(id: string, data: { fileBase64: string; filename: string; caricatoDa: string }): Promise<CommessaPianta> {
  const attuale = await getPiantaById(id);
  if (!attuale) throw new Error("Pianta non trovata");
  const { driveFileId, mimeType } = await caricaSuDrive(attuale.commessaId, data.fileBase64, data.filename);
  const { rows } = await pool.query(
    `UPDATE commessa_piante SET nome_file = $2, mime_type = $3, drive_file_id = $4, caricato_da = $5, anteprima = NULL, vista = NULL, aggiornato_il = now()
     WHERE id = $1 RETURNING ${COLONNE}`,
    [id, data.filename, mimeType, driveFileId, data.caricatoDa],
  );
  try { await deleteDriveFile(attuale.driveFileId); } catch (e) { console.error("[commessa_piante] delete drive:", e instanceof Error ? e.message : e); }
  return mapRow(rows[0]);
}

export async function rinominaPianta(id: string, etichetta: string): Promise<CommessaPianta> {
  const { rows } = await pool.query(`UPDATE commessa_piante SET etichetta = $2, aggiornato_il = now() WHERE id = $1 RETURNING ${COLONNE}`, [id, etichetta]);
  if (!rows[0]) throw new Error("Pianta non trovata");
  return mapRow(rows[0]);
}

export async function deletePianta(id: string): Promise<void> {
  const p = await getPiantaById(id);
  if (!p) return;
  await pool.query(`DELETE FROM commessa_piante WHERE id = $1`, [id]);
  for (const fileId of [p.driveFileId, p.pdfSegnatoDriveId]) {
    if (!fileId) continue;
    try { await deleteDriveFile(fileId); } catch (e) { console.error("[commessa_piante] delete drive:", e instanceof Error ? e.message : e); }
  }
}

// Carica il PDF segnato nella cartella Documenti della commessa e lo sostituisce al precedente
// (rimosso solo dopo che la riga punta al nuovo).
export async function salvaPdfSegnato(id: string, pdf: Buffer, nomeFile: string): Promise<CommessaPianta> {
  const attuale = await getPiantaById(id);
  if (!attuale) throw new Error("Pianta non trovata");
  const folderId = await cartellaDocumenti(attuale.commessaId);
  const uploaded = await driveUploadAllegato(folderId, pdf, nomeFile, "application/pdf");
  const { rows } = await pool.query(
    `UPDATE commessa_piante SET pdf_segnato_drive_id = $2, pdf_segnato_il = now() WHERE id = $1 RETURNING ${COLONNE}`,
    [id, uploaded.id],
  );
  if (attuale.pdfSegnatoDriveId) {
    try { await deleteDriveFile(attuale.pdfSegnatoDriveId); } catch (e) { console.error("[commessa_piante] delete pdf segnato:", e instanceof Error ? e.message : e); }
  }
  return mapRow(rows[0]);
}

// Per la tabella delle commesse: i PDF segnati disponibili, per commessa. Se la colonna non esiste
// ancora (migration non applicata) l'elenco commesse deve comunque funzionare: restituisce vuoto.
export async function getPdfSegnatiPerCommessa(): Promise<Record<string, { id: string; etichetta: string; versione: string }[]>> {
  try {
    const { rows } = await pool.query(
      `SELECT commessa_id, id, etichetta, pdf_segnato_drive_id FROM commessa_piante WHERE pdf_segnato_drive_id IS NOT NULL ORDER BY ordine, creato_il`);
    const out: Record<string, { id: string; etichetta: string; versione: string }[]> = {};
    for (const r of rows) (out[r.commessa_id] ??= []).push({ id: r.id, etichetta: r.etichetta, versione: r.pdf_segnato_drive_id });
    return out;
  } catch (e) {
    console.error("[commessa_piante] pdf segnati:", e instanceof Error ? e.message : e);
    return {};
  }
}

export async function getAnteprima(id: string): Promise<Buffer | null> {
  const { rows } = await pool.query(`SELECT anteprima FROM commessa_piante WHERE id = $1`, [id]);
  return rows[0]?.anteprima ?? null;
}

export async function getVista(id: string): Promise<Buffer | null> {
  const { rows } = await pool.query(`SELECT vista FROM commessa_piante WHERE id = $1`, [id]);
  return rows[0]?.vista ?? null;
}

export async function setVista(id: string, jpeg: Buffer): Promise<void> {
  await pool.query(`UPDATE commessa_piante SET vista = $2 WHERE id = $1`, [id, jpeg]);
}

// Non tocca aggiornato_il: la miniatura è un derivato del file, non una modifica della pianta.
export async function setAnteprima(id: string, jpeg: Buffer): Promise<void> {
  await pool.query(`UPDATE commessa_piante SET anteprima = $2 WHERE id = $1`, [id, jpeg]);
}

export interface AnnotazioniPianta {
  strokes: Record<string, unknown>;
  stamps: Record<string, unknown>;
}

export async function getAnnotazioniPianta(piantaId: string): Promise<AnnotazioniPianta> {
  const { rows } = await pool.query(`SELECT strokes, stamps FROM pianta_annotazioni WHERE pianta_id = $1`, [piantaId]);
  return rows[0] ?? { strokes: {}, stamps: {} };
}

export async function saveAnnotazioniPianta(piantaId: string, a: AnnotazioniPianta, utente: string): Promise<void> {
  await pool.query(
    `INSERT INTO pianta_annotazioni (pianta_id, strokes, stamps, aggiornato_da) VALUES ($1,$2,$3,$4)
     ON CONFLICT (pianta_id) DO UPDATE SET strokes = EXCLUDED.strokes, stamps = EXCLUDED.stamps, aggiornato_da = EXCLUDED.aggiornato_da, aggiornato_il = now()`,
    [piantaId, JSON.stringify(a.strokes), JSON.stringify(a.stamps), utente],
  );
}

// ── Zone cliccabili ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapZona(r: any): ZonaPianta {
  return { id: r.id, piantaId: r.pianta_id, pagina: r.pagina, x: r.x, y: r.y, w: r.w, h: r.h, schedaId: r.scheda_id };
}

export async function getZoneByPianta(piantaId: string): Promise<ZonaPianta[]> {
  const { rows } = await pool.query(`SELECT * FROM pianta_zone WHERE pianta_id = $1 ORDER BY creato_il`, [piantaId]);
  return rows.map(mapZona);
}

export async function getZonaById(id: string): Promise<ZonaPianta | null> {
  const { rows } = await pool.query(`SELECT * FROM pianta_zone WHERE id = $1`, [id]);
  return rows[0] ? mapZona(rows[0]) : null;
}

// ODP della commessa già presenti su almeno una pianta (qualsiasi piano): serve a vedere quali
// mancano ancora.
export async function getSchedeConZona(commessaId: string): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT z.scheda_id FROM pianta_zone z JOIN commessa_piante p ON p.id = z.pianta_id
     WHERE p.commessa_id = $1 AND z.scheda_id IS NOT NULL`, [commessaId]);
  return rows.map((r) => r.scheda_id as string);
}

export async function addZona(data: { piantaId: string; pagina: number; x: number; y: number; w: number; h: number; schedaId: string | null; creatoDa: string }): Promise<ZonaPianta> {
  const { rows } = await pool.query(
    `INSERT INTO pianta_zone (pianta_id, pagina, x, y, w, h, scheda_id, creato_da) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [data.piantaId, data.pagina, data.x, data.y, data.w, data.h, data.schedaId, data.creatoDa],
  );
  return mapZona(rows[0]);
}

export async function updateZona(id: string, data: { schedaId?: string | null; x?: number; y?: number; w?: number; h?: number }): Promise<ZonaPianta> {
  const sets: string[] = []; const values: unknown[] = []; let i = 1;
  if (data.schedaId !== undefined) { sets.push(`scheda_id = $${i++}`); values.push(data.schedaId); }
  for (const k of ["x", "y", "w", "h"] as const) if (data[k] !== undefined) { sets.push(`${k} = $${i++}`); values.push(data[k]); }
  if (sets.length === 0) { const z = await getZonaById(id); if (!z) throw new Error("Zona non trovata"); return z; }
  values.push(id);
  const { rows } = await pool.query(`UPDATE pianta_zone SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, values);
  if (!rows[0]) throw new Error("Zona non trovata");
  return mapZona(rows[0]);
}

export async function deleteZona(id: string): Promise<void> {
  await pool.query(`DELETE FROM pianta_zone WHERE id = $1`, [id]);
}

// Prima zona che mostra questo ODP su una pianta (dal piano più basso): per il link "Vedi sulla
// pianta" nella scheda.
export async function getZonaPerScheda(schedaId: string): Promise<{ commessaId: string; piantaId: string; zonaId: string } | null> {
  const { rows } = await pool.query(
    `SELECT z.id AS zona_id, z.pianta_id, p.commessa_id FROM pianta_zone z JOIN commessa_piante p ON p.id = z.pianta_id
     WHERE z.scheda_id = $1 ORDER BY p.ordine, z.creato_il LIMIT 1`, [schedaId]);
  return rows[0] ? { commessaId: rows[0].commessa_id, piantaId: rows[0].pianta_id, zonaId: rows[0].zona_id } : null;
}
