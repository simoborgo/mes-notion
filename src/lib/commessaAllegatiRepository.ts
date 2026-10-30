import { pool } from "./db";
import type { CommessaAllegato, CategoriaAllegato } from "./types";
import { getCommessaById, getCommessaFolderId, setCommessaFolderId } from "./commesseRepository";
import { decodeBase64File } from "./schedeRepository";
import {
  getOrCreateCommessaFolder, getOrCreateDocumentiCommessaFolder,
  uploadAllegato as driveUploadAllegato, deleteDriveFile,
} from "./googleDriveSchede";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): CommessaAllegato {
  return {
    id: r.id,
    commessaId: r.commessa_id,
    specificaId: r.specifica_id,
    notaId: r.nota_id,
    categoria: r.categoria,
    nomeFile: r.nome_file,
    driveFileId: r.drive_file_id,
    caricatoDa: r.caricato_da,
    creatoIl: new Date(r.creato_il).toISOString(),
  };
}

export async function getAllegatiByCommessa(commessaId: string): Promise<CommessaAllegato[]> {
  const { rows } = await pool.query(`SELECT * FROM commessa_allegati WHERE commessa_id = $1 ORDER BY creato_il DESC`, [commessaId]);
  return rows.map(mapRow);
}

export async function getAllegatoById(id: string): Promise<CommessaAllegato | null> {
  const { rows } = await pool.query(`SELECT * FROM commessa_allegati WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

// Cartella Commessa già nota (colonna drive_folder_id) oppure creata e persistita al primo upload,
// poi sottocartella "Documenti".
async function cartellaDocumenti(commessaId: string): Promise<string> {
  let commessaFolderId = await getCommessaFolderId(commessaId);
  if (!commessaFolderId) {
    const c = await getCommessaById(commessaId);
    commessaFolderId = await getOrCreateCommessaFolder({ numeroCommessa: c.numeroCommessa, cliente: c.cliente, localita: c.localita });
    await setCommessaFolderId(commessaId, commessaFolderId);
  }
  return getOrCreateDocumentiCommessaFolder(commessaFolderId);
}

export async function addAllegato(data: {
  commessaId: string;
  specificaId: string | null;
  notaId?: string | null;
  categoria: CategoriaAllegato;
  fileBase64: string;
  filename: string;
  caricatoDa: string;
}): Promise<CommessaAllegato> {
  const { buffer, mimeType } = decodeBase64File(data.fileBase64);
  const folderId = await cartellaDocumenti(data.commessaId);
  const uploaded = await driveUploadAllegato(folderId, buffer, data.filename, mimeType);
  const { rows } = await pool.query(
    `INSERT INTO commessa_allegati (commessa_id, specifica_id, nota_id, categoria, nome_file, drive_file_id, caricato_da)
     VALUES ($1,$2,$7,$3,$4,$5,$6) RETURNING *`,
    [data.commessaId, data.specificaId, data.categoria, data.filename, uploaded.id, data.caricatoDa, data.notaId ?? null],
  );
  return mapRow(rows[0]);
}

// Elimina la riga e il file su Drive (best-effort: un file già sparito da Drive non blocca la riga).
export async function deleteAllegato(id: string): Promise<void> {
  const a = await getAllegatoById(id);
  if (!a) return;
  await pool.query(`DELETE FROM commessa_allegati WHERE id = $1`, [id]);
  try { await deleteDriveFile(a.driveFileId); } catch (e) { console.error("[commessa_allegati] delete drive:", e instanceof Error ? e.message : e); }
}
