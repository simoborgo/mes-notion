const { google } = require('googleapis');
const stream = require('stream');

const VERIFICHE_FOLDER_ID = process.env.VERIFICHE_DRIVE_FOLDER_ID;

/**
 * Restituisce l'id della sottocartella ODP dentro VERIFICHE_FOLDER_ID,
 * creandola se non esiste ancora.
 */
async function getOrCreateOdpFolder(drive, odpName) {
  const safeOdp = odpName.replace(/[^a-zA-Z0-9\-_]/g, '_');
  const q = `name = '${safeOdp}' and mimeType = 'application/vnd.google-apps.folder' and '${VERIFICHE_FOLDER_ID}' in parents and trashed = false`;
  const list = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  if (list.data.files.length > 0) return list.data.files[0].id;

  const folder = await drive.files.create({
    requestBody: {
      name: safeOdp,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [VERIFICHE_FOLDER_ID],
    },
    fields: 'id',
  });
  return folder.data.id;
}

async function uploadVerificaPdf(authClient, pdfBuffer, schedaNumero) {
  if (!VERIFICHE_FOLDER_ID) throw new Error('VERIFICHE_DRIVE_FOLDER_ID non configurato');

  const drive = google.drive({ version: 'v3', auth: authClient });
  const folderId = await getOrCreateOdpFolder(drive, schedaNumero);
  const filename = `verifica-spedizione-${schedaNumero}-${Date.now()}.pdf`;

  const bufferStream = new stream.PassThrough();
  bufferStream.end(pdfBuffer);

  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId], mimeType: 'application/pdf' },
    media: { mimeType: 'application/pdf', body: bufferStream },
    fields: 'id, webViewLink',
  });
  return { id: res.data.id, webViewLink: res.data.webViewLink };
}

async function uploadFotoVerifica(authClient, jpegBuffer, schedaNumero, progressivo) {
  if (!VERIFICHE_FOLDER_ID) throw new Error('VERIFICHE_DRIVE_FOLDER_ID non configurato');

  const drive = google.drive({ version: 'v3', auth: authClient });
  const folderId = await getOrCreateOdpFolder(drive, schedaNumero);
  const filename = `foto-${schedaNumero}-${progressivo}-${Date.now()}.jpg`;

  const bufferStream = new stream.PassThrough();
  bufferStream.end(jpegBuffer);

  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId], mimeType: 'image/jpeg' },
    media: { mimeType: 'image/jpeg', body: bufferStream },
    fields: 'id, webViewLink',
  });
  return { id: res.data.id, webViewLink: res.data.webViewLink };
}

async function downloadFile(authClient, fileId) {
  const drive = google.drive({ version: 'v3', auth: authClient });
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
}

async function deleteFile(authClient, fileId) {
  const drive = google.drive({ version: 'v3', auth: authClient });
  await drive.files.delete({ fileId });
}

module.exports = { uploadVerificaPdf, uploadFotoVerifica, downloadFile, deleteFile };
