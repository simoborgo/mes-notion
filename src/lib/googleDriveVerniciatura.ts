import { google } from "googleapis";
import { PassThrough } from "stream";
import { getAuthClient } from "./googleDriveAuth";

// Struttura cartelle su Drive (radice: VERNICIATURA_DRIVE_FOLDER_ID):
//   Verniciatura/
//   ├── Vernici/<fornitore>/<id_vernice>/{scheda_tecnica.pdf, scheda_sicurezza.pdf}
//   └── Campionature/<cliente>/<codice_pubblico>/{foto_01.jpg, ..., note.pdf}
// Postgres salva solo il folder id (mai il path), per resistere a rinomine su Drive.

const ROOT_FOLDER_ID = process.env.VERNICIATURA_DRIVE_FOLDER_ID;
const FOLDER_MIME = "application/vnd.google-apps.folder";

function drive() {
  // getAuthClient() è tipizzato in modo largo (ReturnType<typeof google.auth.fromJSON>, unione
  // di più classi auth) — stesso cast pragmatico già usato dentro googleDriveAuth.ts stesso.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return google.drive({ version: "v3", auth: getAuthClient() as any });
}

function sanitizza(nome: string): string {
  return nome.replace(/[^a-zA-Z0-9\-_ ]/g, "_").trim() || "Senza-nome";
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

// Verniciatura/Vernici/<fornitore>/<id_vernice>/
export async function getOrCreateVerniceFolder(fornitoreNome: string | null, verniceId: string): Promise<string> {
  if (!ROOT_FOLDER_ID) throw new Error("VERNICIATURA_DRIVE_FOLDER_ID non configurato");
  const verniciFolder = await getOrCreateSubfolder("Vernici", ROOT_FOLDER_ID);
  const fornitoreFolder = await getOrCreateSubfolder(fornitoreNome || "Senza-fornitore", verniciFolder);
  return getOrCreateSubfolder(verniceId, fornitoreFolder);
}

// Sposta la cartella già esistente di una vernice (id fisso, mai ricreata) sotto la cartella
// del nuovo fornitore — chiamata quando il fornitore viene rinominato dopo il primo upload,
// per tenere la struttura visibile su Drive coerente col dato corrente in MES.
export async function spostaVerniceFolderPerFornitore(driveFolderId: string, nuovoFornitoreNome: string | null): Promise<void> {
  if (!ROOT_FOLDER_ID) throw new Error("VERNICIATURA_DRIVE_FOLDER_ID non configurato");
  const d = drive();
  const verniciFolder = await getOrCreateSubfolder("Vernici", ROOT_FOLDER_ID);
  const nuovaFornitoreFolder = await getOrCreateSubfolder(nuovoFornitoreNome || "Senza-fornitore", verniciFolder);

  const attuale = await d.files.get({ fileId: driveFolderId, fields: "parents" });
  const parentiAttuali = attuale.data.parents ?? [];
  if (parentiAttuali.includes(nuovaFornitoreFolder)) return; // già lì (es. fornitore invariato)

  await d.files.update({
    fileId: driveFolderId,
    addParents: nuovaFornitoreFolder,
    removeParents: parentiAttuali.join(","),
    fields: "id, parents",
  });
}

// Verniciatura/Campionature/<cliente>/<codice_pubblico>/
export async function getOrCreateCampionaturaFolder(cliente: string, codicePubblico: string): Promise<string> {
  if (!ROOT_FOLDER_ID) throw new Error("VERNICIATURA_DRIVE_FOLDER_ID non configurato");
  const campionatureFolder = await getOrCreateSubfolder("Campionature", ROOT_FOLDER_ID);
  const clienteFolder = await getOrCreateSubfolder(cliente, campionatureFolder);
  return getOrCreateSubfolder(codicePubblico, clienteFolder);
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

export async function uploadSchedaTecnica(folderId: string, buffer: Buffer): Promise<{ id: string; webViewLink?: string | null }> {
  return uploadBuffer(folderId, buffer, "scheda_tecnica.pdf", "application/pdf");
}

export async function uploadSchedaSicurezza(folderId: string, buffer: Buffer): Promise<{ id: string; webViewLink?: string | null }> {
  return uploadBuffer(folderId, buffer, "scheda_sicurezza.pdf", "application/pdf");
}

export async function uploadFotoCampionatura(folderId: string, buffer: Buffer, progressivo: number, mimeType = "image/jpeg"): Promise<{ id: string; webViewLink?: string | null }> {
  const ext = mimeType === "image/png" ? "png" : "jpg";
  const nomeFile = `foto_${String(progressivo).padStart(2, "0")}.${ext}`;
  return uploadBuffer(folderId, buffer, nomeFile, mimeType);
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  await drive().files.delete({ fileId });
}

export function driveFileLink(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function driveFolderLink(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
