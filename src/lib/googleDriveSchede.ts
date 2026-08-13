import { google } from "googleapis";
import { PassThrough } from "stream";
import { getAuthClient } from "./googleDriveAuth";

// Struttura cartelle su Drive (radice: COMMESSE_DRIVE_FOLDER_ID):
//   Commesse/
//   └── <numero_commessa> - <cliente> - <località>/
//       └── <ODP>/                                  (una per Scheda/Sottoscheda/Rilavorazione)
//           ├── pdf_allegato.pdf
//           ├── copertina.*
//           ├── ordine_fornitore.pdf
//           └── foto_NN.jpg
// Postgres salva solo l'id (mai il path): commesse.drive_folder_id per la cartella Commessa,
// schede.*_drive_id per i singoli file. La cartella Commessa è popolata in modo lazy (solo al
// primo upload collegato), mai alla sola creazione della Commessa.

const ROOT_FOLDER_ID = process.env.COMMESSE_DRIVE_FOLDER_ID;
const FOLDER_MIME = "application/vnd.google-apps.folder";

function drive() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return google.drive({ version: "v3", auth: getAuthClient() as any });
}

function sanitizza(nome: string): string {
  return nome.replace(/[^a-zA-Z0-9\-_ .]/g, "_").trim() || "Senza-nome";
}

export function nomeCartellaCommessa(commessa: { numeroCommessa: string; cliente: string; localita: string }): string {
  const parti = [commessa.numeroCommessa, commessa.cliente, commessa.localita].filter(Boolean);
  return sanitizza(parti.join(" - "));
}

async function getOrCreateSubfolder(nome: string, parentId: string): Promise<string> {
  const safe = sanitizza(nome);
  const d = drive();
  const q = `name = '${safe.replace(/'/g, "\\'")}' and mimeType = '${FOLDER_MIME}' and '${parentId}' in parents and trashed = false`;
  const list = await d.files.list({ q, fields: "files(id)", pageSize: 1 });
  if (list.data.files && list.data.files.length > 0) return list.data.files[0].id!;

  const folder = await d.files.create({
    requestBody: { name: safe, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: "id",
  });
  return folder.data.id!;
}

// Cartella della Commessa — il chiamante deve passare l'id già noto se presente
// (commesseRepository.getCommessaFolderId) per evitare una ricerca per nome ad ogni upload;
// altrimenti la crea/trova e il chiamante è responsabile di persisterla (setCommessaFolderId).
export async function getOrCreateCommessaFolder(commessa: { numeroCommessa: string; cliente: string; localita: string }): Promise<string> {
  if (!ROOT_FOLDER_ID) throw new Error("COMMESSE_DRIVE_FOLDER_ID non configurato");
  return getOrCreateSubfolder(nomeCartellaCommessa(commessa), ROOT_FOLDER_ID);
}

// Rinomina la cartella Commessa già esistente (id noto) per riflettere numero/cliente/località
// aggiornati — best-effort, va chiamata dal chiamante dopo un update riuscito, mai in un percorso
// bloccante (stesso spirito di spostaVerniceFolderPerFornitore in googleDriveVerniciatura.ts).
export async function rinominaCartellaCommessa(driveFolderId: string, commessa: { numeroCommessa: string; cliente: string; localita: string }): Promise<void> {
  await drive().files.update({
    fileId: driveFolderId,
    requestBody: { name: nomeCartellaCommessa(commessa) },
  });
}

// Cartella della Scheda (MP) dentro la cartella Commessa già risolta.
export async function getOrCreateSchedaFolder(commessaFolderId: string, odp: string): Promise<string> {
  return getOrCreateSubfolder(odp, commessaFolderId);
}

async function uploadBuffer(folderId: string, buffer: Buffer, nomeFile: string, mimeType: string): Promise<{ id: string; webViewLink?: string | null }> {
  const bufferStream = new PassThrough();
  bufferStream.end(buffer);
  const res = await drive().files.create({
    requestBody: { name: nomeFile, parents: [folderId], mimeType },
    media: { mimeType, body: bufferStream },
    fields: "id, webViewLink",
  });
  return { id: res.data.id!, webViewLink: res.data.webViewLink };
}

export async function uploadPdfAllegato(folderId: string, buffer: Buffer, nomeFile: string): Promise<{ id: string; webViewLink?: string | null }> {
  return uploadBuffer(folderId, buffer, nomeFile || "pdf_allegato.pdf", "application/pdf");
}

export async function uploadOrdineFornitore(folderId: string, buffer: Buffer, nomeFile: string): Promise<{ id: string; webViewLink?: string | null }> {
  return uploadBuffer(folderId, buffer, nomeFile || "ordine_fornitore.pdf", "application/pdf");
}

export async function uploadCopertina(folderId: string, buffer: Buffer, mimeType: string): Promise<{ id: string; webViewLink?: string | null }> {
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return uploadBuffer(folderId, buffer, `copertina.${ext}`, mimeType);
}

export async function uploadFoto(folderId: string, buffer: Buffer, progressivo: number, mimeType = "image/jpeg"): Promise<{ id: string; webViewLink?: string | null }> {
  const ext = mimeType === "image/png" ? "png" : "jpg";
  return uploadBuffer(folderId, buffer, `foto_${String(progressivo).padStart(2, "0")}.${ext}`, mimeType);
}

// Foto di un Ritiro/Consegna — finiscono nella stessa cartella MP della Scheda collegata (o
// direttamente nella cartella Commessa se il Ritiro non ha una Scheda), prefisso distinto per non
// confondersi con le Foto della Scheda stessa nella stessa cartella.
export async function uploadFotoRitiro(folderId: string, buffer: Buffer, progressivo: number, mimeType = "image/jpeg"): Promise<{ id: string; webViewLink?: string | null }> {
  const ext = mimeType === "image/png" ? "png" : "jpg";
  return uploadBuffer(folderId, buffer, `ritiro_foto_${String(progressivo).padStart(2, "0")}.${ext}`, mimeType);
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  await drive().files.delete({ fileId });
}

export function driveFileLink(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}
