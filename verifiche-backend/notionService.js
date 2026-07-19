// services/notionService.js
// Aggiorna la riga ODP su Notion quando una verifica spedizione viene finalizzata:
// - stato "Verificato"
// - link al PDF su Drive (archivio ufficiale)
// - IL PDF STESSO caricato come file nella property "PDF Verifica" (consultabile senza uscire da Notion)
// - le FOTO caricate singolarmente nella property "Foto Verifica" (dettaglio zoomabile, non ricompresso
//   dentro il layout del PDF)
//
// Richiede Node 18+ (fetch, FormData, Blob nativi). Usa chiamate dirette all'API REST di Notion
// invece del SDK @notionhq/client per il file upload, perché il supporto nel SDK JS è più recente
// e non sempre allineato — verifica comunque su developers.notion.com/reference/file-upload
// se in futuro il SDK espone metodi dedicati, in tal caso semplifica questo file.

const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN ?? process.env.NOTION_API_KEY });

// Versione API Notion che supporta il File Upload API — verifica sui docs se è cambiata
const NOTION_VERSION = '2026-03-11';
const NOTION_API_BASE = 'https://api.notion.com/v1';

// Nomi delle property sulla database ODP — adatta ai nomi reali che crei su Notion
const STATO_PROPERTY_NAME = 'Stato Verifica Spedizione'; // select
const LINK_DRIVE_PROPERTY_NAME = 'Link PDF Drive';        // url — archivio ufficiale
const PDF_FILE_PROPERTY_NAME = 'PDF Scheda Verificata';    // files & media — copia consultabile in Notion
const FOTO_PROPERTY_NAME = 'Foto Verifica';                 // files & media, multi — foto singole

/**
 * Step 1+2 del File Upload API Notion: crea l'oggetto file_upload, poi carica i byte.
 * Ritorna l'id da usare come { type: 'file_upload', file_upload: { id } } quando si
 * aggiorna la property della pagina. Il file va allegato entro 1 ora dalla creazione.
 */
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
 * @param {string} pageId  notion_page_id della riga ODP
 * @param {object} opts
 * @param {string} opts.statoValue   es. "Verificato"
 * @param {string} [opts.pdfUrl]     link Drive del PDF finale (archivio ufficiale)
 * @param {Buffer} [opts.pdfBuffer]  bytes del PDF finale, per caricarlo anche come file su Notion
 * @param {string} [opts.pdfFilename]
 * @param {Buffer[]} [opts.fotoBuffers]  bytes delle singole foto (JPEG), già compresse lato client
 */
async function aggiornaStatoOdp(pageId, { statoValue, pdfUrl, pdfBuffer, pdfFilename, fotoBuffers } = {}) {
  if (!pageId) return; // nessun page_id noto: skip silenzioso, non bloccare la finalizzazione

  const properties = {
    [STATO_PROPERTY_NAME]: { select: { name: statoValue } },
  };

  if (pdfUrl) {
    properties[LINK_DRIVE_PROPERTY_NAME] = { url: pdfUrl };
  }

  if (pdfBuffer) {
    const filename = pdfFilename || 'verifica-spedizione.pdf';
    const fileUploadId = await uploadFileToNotion(pdfBuffer, filename, 'application/pdf');
    properties[PDF_FILE_PROPERTY_NAME] = {
      files: [{ type: 'file_upload', file_upload: { id: fileUploadId }, name: filename }],
    };
  }

  if (fotoBuffers && fotoBuffers.length) {
    const fotoFiles = [];
    for (let i = 0; i < fotoBuffers.length; i++) {
      const filename = `foto-materiale-${i + 1}.jpg`;
      const fileUploadId = await uploadFileToNotion(fotoBuffers[i], filename, 'image/jpeg');
      fotoFiles.push({ type: 'file_upload', file_upload: { id: fileUploadId }, name: filename });
    }
    properties[FOTO_PROPERTY_NAME] = { files: fotoFiles };
  }

  await notion.pages.update({ page_id: pageId, properties });
}


// Nome della property Files & media sulla database ODP che contiene il PDF
// della scheda di spedizione originale (allegato all'ODP a monte del flusso)
const PDF_ORIGINALE_PROPERTY_NAME = 'PDF Allegato';

/**
 * Recupera i byte del PDF originale allegato alla riga ODP.
 * Gli URL dei file Notion sono firmati e scadono dopo ~1 ora: per questo NON
 * vengono mai salvati — a ogni ripresa si rilegge la property e si ottiene
 * un URL firmato fresco, dal quale si scaricano i byte.
 * @returns {Promise<Buffer|null>}  null se la property è vuota o mancante
 */
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

module.exports = { aggiornaStatoOdp, getPdfOriginale };
