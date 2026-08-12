import { google } from "googleapis";
import { PassThrough } from "stream";
import { getAuthClient } from "./googleDriveAuth";

// Struttura cartelle su Drive (radice: KIT_COMMESSA_DRIVE_FOLDER_ID):
//   KitCommessa/<kit_commessa_id>/riferimento.pdf
// Un solo PDF di riferimento per kit — solo consultazione, nessuna estrazione automatica di righe.

const ROOT_FOLDER_ID = process.env.KIT_COMMESSA_DRIVE_FOLDER_ID;
const FOLDER_MIME = "application/vnd.google-apps.folder";

function drive() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return google.drive({ version: "v3", auth: getAuthClient() as any });
}

async function getOrCreateSubfolder(nome: string, parentId: string): Promise<string> {
  const d = drive();
  const q = `name = '${nome.replace(/'/g, "\\'")}' and mimeType = '${FOLDER_MIME}' and '${parentId}' in parents and trashed = false`;
  const list = await d.files.list({ q, fields: "files(id)", pageSize: 1 });
  if (list.data.files && list.data.files.length > 0) return list.data.files[0].id!;

  const folder = await d.files.create({
    requestBody: { name: nome, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: "id",
  });
  return folder.data.id!;
}

export async function getOrCreateKitCommessaFolder(kitCommessaId: string): Promise<string> {
  if (!ROOT_FOLDER_ID) throw new Error("KIT_COMMESSA_DRIVE_FOLDER_ID non configurato");
  return getOrCreateSubfolder(kitCommessaId, ROOT_FOLDER_ID);
}

export async function uploadPdfRiferimento(folderId: string, buffer: Buffer, nomeFile: string): Promise<{ id: string; webViewLink?: string | null }> {
  const bufferStream = new PassThrough();
  bufferStream.end(buffer);
  const res = await drive().files.create({
    requestBody: { name: nomeFile, parents: [folderId], mimeType: "application/pdf" },
    media: { mimeType: "application/pdf", body: bufferStream },
    fields: "id, webViewLink",
  });
  return { id: res.data.id!, webViewLink: res.data.webViewLink };
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  await drive().files.delete({ fileId });
}

export function driveFileLink(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}
