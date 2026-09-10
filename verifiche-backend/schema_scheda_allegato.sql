-- Tabella figlia per allegati generici (file vari, qualsiasi tipo) — stesso pattern di
-- scheda_pdf_allegato/scheda_ordine_fornitore/scheda_foto, ma senza vincolo sul tipo di file.
-- Finiscono nella sottocartella dedicata "Allegati" dentro la cartella ODP su Drive (vedi
-- getOrCreateAllegatiFolder in googleDriveSchede.ts), per non mescolarsi con PDF Allegato/Ordine
-- Fornitore/Foto che hanno già un posto e un nome fisso nella cartella ODP.
CREATE TABLE IF NOT EXISTS scheda_allegato (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheda_id     UUID NOT NULL REFERENCES schede(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL,
  nome          TEXT NOT NULL DEFAULT '',
  ordine        INT NOT NULL DEFAULT 0,
  creato_il     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheda_allegato_scheda ON scheda_allegato(scheda_id, ordine);
