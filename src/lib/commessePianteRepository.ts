import { pool } from "./db";
import type { CommessaPianta } from "./types";
import { decodeBase64File } from "./schedeRepository";
import { cartellaDocumenti } from "./commessaAllegatiRepository";
import { uploadAllegato as driveUploadAllegato, deleteDriveFile } from "./googleDriveSchede";

// Mai SELECT *: la miniatura (bytea) non deve viaggiare con ogni elenco.
const COLONNE = `id, commessa_id, etichetta, ordine, nome_file, mime_type, drive_file_id, caricato_da, creato_il, aggiornato_il, (anteprima IS NOT NULL) AS ha_anteprima`;

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
    `UPDATE commessa_piante SET nome_file = $2, mime_type = $3, drive_file_id = $4, caricato_da = $5, anteprima = NULL, aggiornato_il = now()
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
  try { await deleteDriveFile(p.driveFileId); } catch (e) { console.error("[commessa_piante] delete drive:", e instanceof Error ? e.message : e); }
}

export async function getAnteprima(id: string): Promise<Buffer | null> {
  const { rows } = await pool.query(`SELECT anteprima FROM commessa_piante WHERE id = $1`, [id]);
  return rows[0]?.anteprima ?? null;
}

// Non tocca aggiornato_il: la miniatura è un derivato del file, non una modifica della pianta.
export async function setAnteprima(id: string, jpeg: Buffer): Promise<void> {
  await pool.query(`UPDATE commessa_piante SET anteprima = $2 WHERE id = $1`, [id, jpeg]);
}
