// services/driveService.js
// Upload del PDF evidenziato finale su una cartella Drive dedicata.
// Richiede un client OAuth2 già autenticato (stesso pattern usato altrove nel MES
// per l'upload foto materiale in ingresso / CV — riusa quel client, non crearne uno nuovo).

const { google } = require('googleapis');
const stream = require('stream');

// Cartella Drive dedicata alle verifiche spedizione finalizzate.
// Va creata una volta e l'id inserito qui o in env (VERIFICHE_DRIVE_FOLDER_ID).
const VERIFICHE_FOLDER_ID = process.env.VERIFICHE_DRIVE_FOLDER_ID;

/**
 * @param {import('google-auth-library').OAuth2Client} authClient  client OAuth2 già autenticato
 * @param {Buffer} pdfBuffer  bytes del PDF flattenato
 * @param {string} schedaNumero  es. "MP26-014"
 * @returns {Promise<{id: string, webViewLink: string}>}
 */
async function uploadVerificaPdf(authClient, pdfBuffer, schedaNumero) {
  if (!VERIFICHE_FOLDER_ID) {
    throw new Error('VERIFICHE_DRIVE_FOLDER_ID non configurato');
  }

  const drive = google.drive({ version: 'v3', auth: authClient });
  const filename = `verifica-spedizione-${schedaNumero}-${Date.now()}.pdf`;

  const bufferStream = new stream.PassThrough();
  bufferStream.end(pdfBuffer);

  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [VERIFICHE_FOLDER_ID],
      mimeType: 'application/pdf',
    },
    media: {
      mimeType: 'application/pdf',
      body: bufferStream,
    },
    fields: 'id, webViewLink',
  });

  return { id: res.data.id, webViewLink: res.data.webViewLink };
}


/**
 * Upload di una singola foto di documentazione materiale, immediato allo scatto.
 * @returns {Promise<{id: string, webViewLink: string}>}
 */
async function uploadFotoVerifica(authClient, jpegBuffer, schedaNumero, progressivo) {
  if (!VERIFICHE_FOLDER_ID) throw new Error('VERIFICHE_DRIVE_FOLDER_ID non configurato');

  const drive = google.drive({ version: 'v3', auth: authClient });
  const filename = `foto-${schedaNumero}-${progressivo}-${Date.now()}.jpg`;

  const bufferStream = new stream.PassThrough();
  bufferStream.end(jpegBuffer);

  const res = await drive.files.create({
    requestBody: { name: filename, parents: [VERIFICHE_FOLDER_ID], mimeType: 'image/jpeg' },
    media: { mimeType: 'image/jpeg', body: bufferStream },
    fields: 'id, webViewLink',
  });
  return { id: res.data.id, webViewLink: res.data.webViewLink };
}

/**
 * Scarica i byte di un file da Drive (usato in finalize per passare le foto
 * già caricate su Drive all'upload Notion, senza che il client le rimandi).
 * @returns {Promise<Buffer>}
 */
async function downloadFile(authClient, fileId) {
  const drive = google.drive({ version: 'v3', auth: authClient });
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
}

/** Elimina un file da Drive (rimozione foto prima della finalizzazione). */
async function deleteFile(authClient, fileId) {
  const drive = google.drive({ version: 'v3', auth: authClient });
  await drive.files.delete({ fileId });
}

module.exports = { uploadVerificaPdf, uploadFotoVerifica, downloadFile, deleteFile };
