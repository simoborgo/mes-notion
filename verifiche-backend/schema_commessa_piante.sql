-- Piante del negozio nella scheda commessa: una per piano (etichetta libera, es. "Piano terra").
-- File su Google Drive (cartella Documenti della commessa), come commessa_allegati.
-- Le zone cliccabili agganciate agli ODP arrivano in una fase successiva con la propria migration.

CREATE TABLE IF NOT EXISTS commessa_piante (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commessa_id   UUID NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
  etichetta     TEXT NOT NULL DEFAULT '',
  ordine        INTEGER NOT NULL DEFAULT 0,
  nome_file     TEXT NOT NULL,
  mime_type     TEXT NOT NULL DEFAULT 'application/pdf',
  drive_file_id TEXT NOT NULL,
  caricato_da   TEXT NOT NULL DEFAULT '',
  creato_il     TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commessa_piante_commessa ON commessa_piante(commessa_id, ordine);
