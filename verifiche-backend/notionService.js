const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN ?? process.env.NOTION_API_KEY });

const NOTION_VERSION = '2026-03-11';
const NOTION_API_BASE = 'https://api.notion.com/v1';

// Property names sul database Schede di Produzione
const STATO_PROPERTY_NAME = 'Stato';             // status type — valori: Materiale Pronto → Completato
const PDF_FILE_PROPERTY_NAME = 'PDF Scheda Verificata'; // files & media — da aggiungere al DB Notion se non esiste

async function uploadFileToNotion(buffer, filename, contentType) {
  const createRes = await fetch(`${NOTION_API_BASE}/file_uploads`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN ?? process.env.NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filename, content_type: contentType }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    throw new Error(`Notion file_uploads create fallita: ${created.message || createRes.status}`);
  }

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: contentType }), filename);

  const uploadRes = await fetch(created.upload_url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN ?? process.env.NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
    },
    body: form,
  });
  if (!uploadRes.ok) {
    throw new Error(`Upload contenuto a Notion fallito per ${filename}`);
  }

  return created.id;
}

/**
 * Aggiorna la riga ODP su Notion alla finalizzazione:
 * - Stato → "Completato"
 * - PDF Scheda Verificata → file caricato (richiede che la property esista nel DB Notion)
 */
async function aggiornaStatoOdp(pageId, { pdfBuffer, pdfFilename } = {}) {
  if (!pageId) return;

  // Imposta Stato → Verificato (tipo select, non status)
  const properties = {
    [STATO_PROPERTY_NAME]: { select: { name: 'Verificato' } },
  };

  // Carica il PDF come file nella property "PDF Scheda Verificata"
  if (pdfBuffer) {
    try {
      const filename = pdfFilename || 'verifica-spedizione.pdf';
      const fileUploadId = await uploadFileToNotion(pdfBuffer, filename, 'application/pdf');
      properties[PDF_FILE_PROPERTY_NAME] = {
        files: [{ type: 'file_upload', file_upload: { id: fileUploadId }, name: filename }],
      };
    } catch (e) {
      console.warn('[notionService] upload PDF Scheda Verificata fallito (property assente?):', e.message);
    }
  }

  await notion.pages.update({ page_id: pageId, properties });
}

const PDF_ORIGINALE_PROPERTY_NAME = 'PDF Allegato';

async function getPdfOriginale(pageId) {
  if (!pageId) return null;

  const token = process.env.NOTION_TOKEN ?? process.env.NOTION_API_KEY;
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
    },
  });
  if (!res.ok) throw new Error(`Notion pages.retrieve fallita: ${res.status}`);
  const page = await res.json();

  const prop = page.properties[PDF_ORIGINALE_PROPERTY_NAME];
  if (!prop || prop.type !== 'files' || !prop.files.length) return null;

  const fileEntry = prop.files[0];
  const url = fileEntry.type === 'file' ? fileEntry.file.url
            : fileEntry.type === 'external' ? fileEntry.external.url
            : null;
  if (!url) return null;

  const pdfRes = await fetch(url);
  if (!pdfRes.ok) throw new Error(`Download PDF originale da Notion fallito: ${pdfRes.status}`);
  return Buffer.from(await pdfRes.arrayBuffer());
}

async function uploadPdfAllegato(pageId, pdfBuffer, filename) {
  const fileUploadId = await uploadFileToNotion(pdfBuffer, filename, 'application/pdf');
  await notion.pages.update({
    page_id: pageId,
    properties: {
      'PDF Allegato': {
        files: [{ type: 'file_upload', file_upload: { id: fileUploadId }, name: filename }],
      },
    },
  });
}

module.exports = { aggiornaStatoOdp, getPdfOriginale, uploadPdfAllegato };
