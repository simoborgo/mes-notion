-- Ritiri/Consegne migrati da Notion (NOTION_DB_RITIRI). id riusa il Notion page id esistente —
-- stesso motivo delle altre migrazioni: eventuali riferimenti esterni sciolti restano validi.
--
-- Schema Notion verificato via API (non assunto dal mapper) prima di scrivere questo file:
-- "PDF Scheda" e "Ordine Fornitore" sul Ritiro sono ROLLUP dalla Scheda collegata (relation
-- "Scheda" → proprietà "PDF Allegato"/"Ordine Fornitore" della Scheda), non allegati propri del
-- Ritiro — quindi non hanno una colonna qui, si calcolano con una JOIN verso schede/
-- scheda_ordine_fornitore quando serve mostrarli (mai più letti da Notion). "PDF Ordine
-- Fornitore" nel vecchio codice leggeva una proprietà Notion che non esiste più nello schema —
-- era sempre un array vuoto, non migrato. L'unico allegato genuinamente proprio del Ritiro è
-- "Foto" (files, mai un rollup) — tabella figlia ritiro_foto, stesso pattern di scheda_foto.
--
-- Stato/Tipo Movimento/Urgenza erano select/status a opzioni fisse — replicati come CHECK.
CREATE TABLE IF NOT EXISTS ritiri (
  id              UUID PRIMARY KEY,
  descrizione     TEXT NOT NULL DEFAULT '', -- "Descrizione" Notion (causale/descrizioneMerce/note erano tutti alias dello stesso title)
  scheda_id       UUID REFERENCES schede(id),
  rilavorazione_id UUID REFERENCES schede(id),
  commessa_id     UUID REFERENCES commesse(id),
  data_trasporto  DATE,
  data_fatto      DATE,
  tipo_movimento  TEXT NOT NULL DEFAULT '' CHECK (tipo_movimento IN ('', 'Ritiro', 'Consegna')),
  stato           TEXT NOT NULL DEFAULT 'Da Fare' CHECK (stato IN ('Da Fare', 'In corso', 'Fatto')),
  urgenza         BOOLEAN NOT NULL DEFAULT false,
  nc              BOOLEAN NOT NULL DEFAULT false,
  nr_collo        INT,
  tot_colli       INT,
  fornitore_id    UUID REFERENCES fornitori(id),
  archiviato      BOOLEAN NOT NULL DEFAULT false,
  legacy_foto_count INT NOT NULL DEFAULT 0,
  creato_il       TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornato_il   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ritiri_scheda ON ritiri(scheda_id);
CREATE INDEX IF NOT EXISTS idx_ritiri_rilavorazione ON ritiri(rilavorazione_id);
CREATE INDEX IF NOT EXISTS idx_ritiri_commessa ON ritiri(commessa_id);
CREATE INDEX IF NOT EXISTS idx_ritiri_fornitore ON ritiri(fornitore_id);
CREATE INDEX IF NOT EXISTS idx_ritiri_stato ON ritiri(stato);
CREATE INDEX IF NOT EXISTS idx_ritiri_archiviato ON ritiri(archiviato);

-- Foto caricate direttamente sul Ritiro (mai un rollup) — finiscono su Drive nella stessa
-- cartella MP della Scheda collegata (o nella cartella Commessa se non c'è una Scheda), i nuovi
-- upload da qui in poi. Le foto già su Notion al momento della migrazione restano lì
-- (legacy_foto_count sopra), stesso pattern delle tabelle figlie di schede.
CREATE TABLE IF NOT EXISTS ritiro_foto (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ritiro_id     UUID NOT NULL REFERENCES ritiri(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL,
  ordine        INT NOT NULL DEFAULT 0,
  creato_il     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ritiro_foto_ritiro ON ritiro_foto(ritiro_id, ordine);
