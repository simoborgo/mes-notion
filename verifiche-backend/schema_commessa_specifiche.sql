-- Scheda commessa come contenitore: Specifiche (finiture, materiali, ignifugo...) + allegati.
-- Le Campionature NON hanno tabelle qui: si leggono da schede_verniciatura.commessa_id.
-- Lo Storico (note + feed) arriva in una fase successiva con la propria migration.

CREATE TABLE IF NOT EXISTS commessa_specifiche (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commessa_id   UUID NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL DEFAULT 'Altro'
                  CHECK (tipo IN ('Finitura', 'Materiale', 'Ignifugo', 'Altro')),
  titolo        TEXT NOT NULL,
  descrizione   TEXT NOT NULL DEFAULT '',
  stato         TEXT NOT NULL DEFAULT 'Da confermare'
                  CHECK (stato IN ('Da confermare', 'Confermata', 'Nota')),
  creato_da     TEXT NOT NULL DEFAULT '',
  creato_il     TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commessa_specifiche_commessa ON commessa_specifiche(commessa_id);

-- File su Google Drive (cartella per commessa). specifica_id nullo = documento generico della
-- commessa (tab Documenti); valorizzato = allegato di una voce di Specifiche.
CREATE TABLE IF NOT EXISTS commessa_allegati (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commessa_id   UUID NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
  specifica_id  UUID REFERENCES commessa_specifiche(id) ON DELETE CASCADE,
  categoria     TEXT NOT NULL DEFAULT 'Altro'
                  CHECK (categoria IN ('Certificato', 'Ordine', 'Scheda tecnica', 'Altro')),
  nome_file     TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  caricato_da   TEXT NOT NULL DEFAULT '',
  creato_il     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commessa_allegati_commessa ON commessa_allegati(commessa_id);
CREATE INDEX IF NOT EXISTS idx_commessa_allegati_specifica ON commessa_allegati(specifica_id);
