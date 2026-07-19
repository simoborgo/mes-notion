// repositories/verificheRepository.js
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

const LOCK_TTL_MINUTI = 30;

// ── Lock pessimistico ────────────────────────────────────────────────────────
// Chiave primaria di business: notion_page_id (UUID Notion della pagina ODP).
// scheda_numero (ODP es. MP26-057) è conservato solo per display/log.

async function acquireLock(notionPageId, schedaNumero, operatore) {
  const { rows } = await pool.query(
    `INSERT INTO verifiche_spedizione (notion_page_id, scheda_numero, operatore, lock_operatore, lock_scadenza)
     VALUES ($1, $2, $3, $3, now() + make_interval(mins => $4))
     ON CONFLICT (notion_page_id) DO UPDATE SET
       scheda_numero  = COALESCE(EXCLUDED.scheda_numero, verifiche_spedizione.scheda_numero),
       lock_operatore = $3,
       lock_scadenza  = now() + make_interval(mins => $4)
     WHERE verifiche_spedizione.lock_operatore IS NULL
        OR verifiche_spedizione.lock_scadenza < now()
        OR verifiche_spedizione.lock_operatore = $3
     RETURNING *`,
    [notionPageId, schedaNumero || null, operatore, LOCK_TTL_MINUTI]
  );

  if (rows[0]) return { acquired: true, record: rows[0] };

  const { rows: existing } = await pool.query(
    `SELECT lock_operatore, lock_scadenza, stato FROM verifiche_spedizione WHERE notion_page_id = $1`,
    [notionPageId]
  );
  return {
    acquired: false,
    lockedBy: existing[0]?.lock_operatore ?? null,
    lockScadenza: existing[0]?.lock_scadenza ?? null,
  };
}

async function releaseLock(notionPageId, operatore) {
  const { rowCount } = await pool.query(
    `UPDATE verifiche_spedizione SET lock_operatore = NULL, lock_scadenza = NULL
     WHERE notion_page_id = $1 AND lock_operatore = $2`,
    [notionPageId, operatore]
  );
  return rowCount > 0;
}

async function holdsLock(notionPageId, operatore) {
  const { rows } = await pool.query(
    `SELECT 1 FROM verifiche_spedizione
     WHERE notion_page_id = $1 AND lock_operatore = $2 AND lock_scadenza > now()`,
    [notionPageId, operatore]
  );
  return rows.length > 0;
}

// ── Progresso / stato ────────────────────────────────────────────────────────
async function upsertProgress({ notionPageId, schedaNumero, operatore, annotazioni, fotoCount }) {
  const { rows } = await pool.query(
    `INSERT INTO verifiche_spedizione
       (notion_page_id, scheda_numero, operatore, annotazioni, foto_count, stato, lock_operatore, lock_scadenza)
     VALUES ($1, $2, $3, $4::jsonb, $5, 'in_verifica', $3, now() + make_interval(mins => $6))
     ON CONFLICT (notion_page_id) DO UPDATE SET
       scheda_numero  = COALESCE(EXCLUDED.scheda_numero, verifiche_spedizione.scheda_numero),
       operatore      = EXCLUDED.operatore,
       annotazioni    = EXCLUDED.annotazioni,
       foto_count     = EXCLUDED.foto_count,
       lock_operatore = EXCLUDED.operatore,
       lock_scadenza  = now() + make_interval(mins => $6)
     RETURNING *`,
    [notionPageId, schedaNumero || null, operatore, JSON.stringify(annotazioni), fotoCount, LOCK_TTL_MINUTI]
  );
  return rows[0];
}

async function finalize({ notionPageId, operatore, pdfDriveId, pdfDriveUrl }) {
  const { rows } = await pool.query(
    `UPDATE verifiche_spedizione SET
       stato          = 'verificato',
       operatore      = $2,
       pdf_drive_id   = $3,
       pdf_drive_url  = $4,
       data_chiusura  = now(),
       lock_operatore = NULL,
       lock_scadenza  = NULL
     WHERE notion_page_id = $1 AND stato = 'in_verifica'
     RETURNING *`,
    [notionPageId, operatore, pdfDriveId, pdfDriveUrl]
  );
  if (!rows[0]) {
    const existing = await findByNotionPageId(notionPageId);
    if (existing && existing.stato === 'verificato') {
      const err = new Error(`La scheda è già stata finalizzata`);
      err.code = 'ALREADY_FINALIZED';
      throw err;
    }
    throw new Error(`Nessuna verifica in corso trovata`);
  }
  return rows[0];
}

async function findByNotionPageId(notionPageId) {
  const { rows } = await pool.query(
    `SELECT * FROM verifiche_spedizione WHERE notion_page_id = $1`,
    [notionPageId]
  );
  return rows[0] || null;
}

// Mantenuto per lookup admin/log (non come chiave di routing)
async function findBySchedaNumero(schedaNumero) {
  const { rows } = await pool.query(
    `SELECT * FROM verifiche_spedizione WHERE scheda_numero = $1`,
    [schedaNumero]
  );
  return rows[0] || null;
}

async function listInSospeso() {
  const { rows } = await pool.query(
    `SELECT notion_page_id, scheda_numero, operatore, foto_count, lock_operatore, lock_scadenza, data_apertura, updated_at
     FROM verifiche_spedizione
     WHERE stato = 'in_verifica'
     ORDER BY updated_at DESC`
  );
  return rows;
}

async function listVerificate() {
  const { rows } = await pool.query(
    `SELECT notion_page_id, scheda_numero, operatore, foto_count, pdf_drive_url, updated_at
     FROM verifiche_spedizione
     WHERE stato = 'verificato'
     ORDER BY updated_at DESC`
  );
  return rows;
}

// ── Foto ─────────────────────────────────────────────────────────────────────
async function addFoto({ notionPageId, schedaNumero, driveId, driveUrl, operatore }) {
  const { rows } = await pool.query(
    `INSERT INTO verifiche_foto (notion_page_id, scheda_numero, drive_id, drive_url, operatore)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [notionPageId, schedaNumero || null, driveId, driveUrl, operatore]
  );
  await pool.query(
    `UPDATE verifiche_spedizione SET foto_count = (SELECT count(*) FROM verifiche_foto WHERE notion_page_id = $1)
     WHERE notion_page_id = $1`,
    [notionPageId]
  );
  return rows[0];
}

async function removeFoto(fotoId) {
  const { rows } = await pool.query(
    `DELETE FROM verifiche_foto WHERE id = $1 RETURNING *`,
    [fotoId]
  );
  if (rows[0]) {
    await pool.query(
      `UPDATE verifiche_spedizione SET foto_count = (SELECT count(*) FROM verifiche_foto WHERE notion_page_id = $1)
       WHERE notion_page_id = $1`,
      [rows[0].notion_page_id]
    );
  }
  return rows[0] || null;
}

async function listFoto(notionPageId) {
  const { rows } = await pool.query(
    `SELECT * FROM verifiche_foto WHERE notion_page_id = $1 ORDER BY ts ASC`,
    [notionPageId]
  );
  return rows;
}

// ── Log / sync ───────────────────────────────────────────────────────────────
async function appendLog({ schedaNumero, operatore, azione, dettaglio }) {
  await pool.query(
    `INSERT INTO verifiche_log (scheda_numero, operatore, azione, dettaglio)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [schedaNumero, operatore || null, azione, JSON.stringify(dettaglio || {})]
  );
}

async function getLog(schedaNumero) {
  const { rows } = await pool.query(
    `SELECT * FROM verifiche_log WHERE scheda_numero = $1 ORDER BY ts ASC`,
    [schedaNumero]
  );
  return rows;
}

async function setNotionSyncOk(notionPageId, ok) {
  await pool.query(
    `UPDATE verifiche_spedizione SET notion_sync_ok = $2 WHERE notion_page_id = $1`,
    [notionPageId, ok]
  );
}

async function listNotionSyncFalliti() {
  const { rows } = await pool.query(
    `SELECT notion_page_id, scheda_numero, pdf_drive_url, operatore, data_chiusura
     FROM verifiche_spedizione
     WHERE stato = 'verificato' AND notion_sync_ok = false
     ORDER BY data_chiusura ASC`
  );
  return rows;
}

async function deleteScheda(notionPageId) {
  const { rows } = await pool.query(
    `DELETE FROM verifiche_spedizione WHERE notion_page_id = $1 RETURNING notion_page_id`,
    [notionPageId]
  );
  return rows.length > 0;
}

module.exports = {
  LOCK_TTL_MINUTI,
  acquireLock,
  releaseLock,
  holdsLock,
  upsertProgress,
  finalize,
  findByNotionPageId,
  findBySchedaNumero,
  listInSospeso,
  listVerificate,
  addFoto,
  removeFoto,
  listFoto,
  appendLog,
  getLog,
  setNotionSyncOk,
  listNotionSyncFalliti,
  deleteScheda,
};
