-- Log append-only dei movimenti di magazzino ferramenta. Notion resta la fonte
-- di verità sulla giacenza corrente; questa tabella serve per audit/analytics
-- ad alta frequenza senza stressare le rate limit dell'API Notion.
CREATE TABLE IF NOT EXISTS movimenti_ferramenta (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  articolo_id           TEXT NOT NULL,          -- Notion page id dell'Articolo Ferramenta
  codice_os1            TEXT,                   -- denormalizzato per leggibilità/debug
  tipo                  TEXT NOT NULL CHECK (tipo IN ('scarico_kanban', 'scarico_a_pezzo', 'carico')),
  quantita              NUMERIC(10,2) NOT NULL CHECK (quantita > 0),
  giacenza_precedente   NUMERIC(10,2) NOT NULL,
  giacenza_risultante   NUMERIC(10,2) NOT NULL,
  operatore             TEXT NOT NULL,
  fonte                 TEXT NOT NULL DEFAULT 'mes' CHECK (fonte IN ('mes', 'webhook_notion')),
  note                  TEXT,
  creato_il             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movimenti_articolo ON movimenti_ferramenta(articolo_id, creato_il);
CREATE INDEX IF NOT EXISTS idx_movimenti_tipo ON movimenti_ferramenta(tipo, creato_il);

-- Ledger generico di idempotenza notifiche — riusabile da qualsiasi modulo futuro,
-- non solo Ferramenta. Persistito (sopravvive a un riavvio), a differenza di un
-- lock in-memory.
CREATE TABLE IF NOT EXISTS notifiche_inviate (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  TEXT NOT NULL,     -- es. 'articolo_ferramenta'
  entity_id    TEXT NOT NULL,     -- es. Notion page id
  event_type   TEXT NOT NULL,     -- es. 'sotto_soglia', 'sotto_soglia_notion'
  event_id     TEXT NOT NULL,     -- id del movimento MES, o event_id fornito dal webhook n8n
  canale       TEXT NOT NULL DEFAULT 'telegram',
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  esito        TEXT NOT NULL DEFAULT 'in_corso' CHECK (esito IN ('in_corso', 'inviata', 'fallita')),
  errore       TEXT,
  creato_il    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, event_type, event_id)
);

CREATE INDEX IF NOT EXISTS idx_notifiche_esito ON notifiche_inviate(esito) WHERE esito = 'fallita';
