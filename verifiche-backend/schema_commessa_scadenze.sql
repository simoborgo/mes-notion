-- Scadenze della commessa (opzionalmente legate a un ODP) e provenienza delle note.
-- Gli eventi (creata/chiusa) non hanno tabella: il feed Storico li legge da audit_log.
CREATE TABLE IF NOT EXISTS commessa_scadenze (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commessa_id UUID NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
  scheda_id   UUID REFERENCES schede(id) ON DELETE SET NULL,
  titolo      TEXT NOT NULL,
  scadenza    DATE NOT NULL,
  stato       TEXT NOT NULL DEFAULT 'aperta' CHECK (stato IN ('aperta', 'fatta')),
  fatta_il    TIMESTAMPTZ,
  fonte       TEXT NOT NULL DEFAULT 'manuale' CHECK (fonte IN ('manuale', 'telegram')),
  creato_da   TEXT NOT NULL DEFAULT '',
  creato_il   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commessa_scadenze_commessa ON commessa_scadenze(commessa_id, stato, scadenza);
CREATE INDEX IF NOT EXISTS idx_commessa_scadenze_scheda ON commessa_scadenze(scheda_id);

ALTER TABLE commessa_note ADD COLUMN IF NOT EXISTS scheda_id UUID REFERENCES schede(id) ON DELETE SET NULL;
ALTER TABLE commessa_note ADD COLUMN IF NOT EXISTS fonte TEXT NOT NULL DEFAULT 'manuale';
