-- Audit log migrato da Notion (NOTION_DB_AUDIT). Append-only: nessun update/delete previsto, id
-- generato (non riusa il Notion page id — nessun'altra tabella referenzia le righe di audit per
-- id, a differenza delle altre migrazioni).
--
-- Schema Notion verificato via API prima di scrivere questo file: Operatore (title), Azione
-- (rich_text), "ID Risorsa" (rich_text), Modifiche (rich_text), Timestamp (date) — corrisponde
-- esattamente ai commenti già presenti in src/lib/audit.ts.
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operatore   TEXT NOT NULL DEFAULT '',
  azione      TEXT NOT NULL DEFAULT '',
  id_risorsa  TEXT NOT NULL DEFAULT '',
  modifiche   TEXT NOT NULL DEFAULT '',
  creato_il   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_creato_il ON audit_log(creato_il DESC);
