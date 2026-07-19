-- Verifiche spedizione: stato corrente, una riga per scheda
CREATE TABLE IF NOT EXISTS verifiche_spedizione (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheda_numero   TEXT UNIQUE NOT NULL,          -- numero ODP, es. MP26-014 — chiave di ricerca/ripresa
  notion_page_id  TEXT,                          -- page_id Notion della riga ODP corrispondente
  stato           TEXT NOT NULL DEFAULT 'in_verifica'
                    CHECK (stato IN ('in_verifica', 'verificato')),
  operatore       TEXT,
  annotazioni     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { strokes, stamps, currentPage, totalPages }
  foto_count      INT NOT NULL DEFAULT 0,
  pdf_drive_id    TEXT,                          -- Drive file id del PDF finale flattenato
  pdf_drive_url   TEXT,                          -- link diretto (webViewLink)
  notion_sync_ok  BOOLEAN,                       -- NULL = mai tentato, false = fallito (da riconciliare via n8n), true = ok
  -- Lock pessimistico: chi sta lavorando sulla scheda e fino a quando.
  -- Rinnovato ad ogni salvataggio progresso; scaduto il TTL, chiunque può subentrare.
  lock_operatore  TEXT,
  lock_scadenza   TIMESTAMPTZ,
  data_apertura   TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_chiusura   TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verifiche_stato ON verifiche_spedizione(stato);
-- indice parziale per il job di riconciliazione Notion (n8n): trova subito le righe da riprovare
CREATE INDEX IF NOT EXISTS idx_verifiche_notion_retry
  ON verifiche_spedizione(scheda_numero) WHERE notion_sync_ok = false;

-- Foto di documentazione materiale: una riga per foto, caricata su Drive
-- IMMEDIATAMENTE allo scatto (non alla finalizzazione) — mai perse, ripresa cross-device completa
CREATE TABLE IF NOT EXISTS verifiche_foto (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheda_numero   TEXT NOT NULL REFERENCES verifiche_spedizione(scheda_numero) ON DELETE CASCADE,
  drive_id        TEXT NOT NULL,
  drive_url       TEXT NOT NULL,
  operatore       TEXT,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foto_scheda ON verifiche_foto(scheda_numero, ts);

-- Log eventi, append-only, audit trail
CREATE TABLE IF NOT EXISTS verifiche_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheda_numero   TEXT NOT NULL,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
  operatore       TEXT,
  azione          TEXT NOT NULL
                    CHECK (azione IN (
                      'apertura', 'salvataggio_progresso',
                      'foto_aggiunta', 'foto_rimossa',
                      'lock_acquisito', 'lock_rilasciato', 'lock_subentro',
                      'finalizzazione', 'notion_sync_riuscito', 'errore'
                    )),
  dettaglio       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_log_scheda ON verifiche_log(scheda_numero, ts);

-- Trigger per tenere updated_at allineato
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verifiche_updated_at ON verifiche_spedizione;
CREATE TRIGGER trg_verifiche_updated_at
  BEFORE UPDATE ON verifiche_spedizione
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
