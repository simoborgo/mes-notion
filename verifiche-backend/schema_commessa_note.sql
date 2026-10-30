-- Storico scheda commessa: note scritte a mano (con allegati). Il resto del feed si compone in
-- lettura da tabelle di dominio e audit_log, senza duplicare dati.
CREATE TABLE IF NOT EXISTS commessa_note (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commessa_id UUID NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
  testo       TEXT NOT NULL,
  creato_da   TEXT NOT NULL DEFAULT '',
  creato_il   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commessa_note_commessa ON commessa_note(commessa_id);

ALTER TABLE commessa_allegati ADD COLUMN IF NOT EXISTS nota_id UUID REFERENCES commessa_note(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_commessa_allegati_nota ON commessa_allegati(nota_id);
