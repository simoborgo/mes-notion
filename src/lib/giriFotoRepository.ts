import { pool } from "./db";
import { resolveSchedaFolder, decodeBase64File } from "./schedeRepository";
import { uploadFotoGiro, deleteDriveFile } from "./googleDriveSchede";

// Foto di un giro esterno. Separato da giriRepository perché dipende da schedeRepository (cartella
// Drive della scheda), che a sua volta importa giriRepository: tenerle insieme creerebbe un ciclo.

export async function appendFotoToGiro(giroId: string, fotoBase64Array: string[]): Promise<void> {
  if (!fotoBase64Array.length) return;
  const { rows } = await pool.query(`SELECT scheda_id FROM schede_giri WHERE id = $1`, [giroId]);
  if (rows.length === 0) throw new Error(`Giro non trovato: ${giroId}`);
  const folderId = await resolveSchedaFolder(rows[0].scheda_id);

  const { rows: nextRows } = await pool.query(`SELECT COALESCE(MAX(ordine), -1) + 1 AS next FROM schede_giri_foto WHERE giro_id = $1`, [giroId]);
  let ordine = nextRows[0].next as number;

  for (const base64 of fotoBase64Array) {
    const { buffer, mimeType } = decodeBase64File(base64);
    const uploaded = await uploadFotoGiro(folderId, buffer, ordine, mimeType);
    await pool.query(`INSERT INTO schede_giri_foto (giro_id, drive_file_id, ordine) VALUES ($1,$2,$3)`, [giroId, uploaded.id, ordine]);
    ordine++;
  }
}

export async function removeFotoFromGiro(giroId: string, fotoId: string): Promise<void> {
  const { rows } = await pool.query(
    `DELETE FROM schede_giri_foto WHERE id = $1 AND giro_id = $2 RETURNING drive_file_id`,
    [fotoId, giroId],
  );
  if (rows.length === 0) throw new Error("Foto non trovata");
  try {
    await deleteDriveFile(rows[0].drive_file_id);
  } catch (e) {
    console.error("[removeFotoFromGiro] pulizia Drive fallita:", (e as Error).message);
  }
}
