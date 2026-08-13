-- Carichi (spedizioni/consegne verso i clienti) migrati da Notion (NOTION_DB_CARICHI). id riusa il
-- Notion page id esistente — stesso motivo delle altre migrazioni.
--
-- Schema Notion verificato via API (non assunto dal mapper) prima di scrivere questo file:
-- "Commessa Cliente Info" è un rollup dalla Commessa (mai usato dall'app, non migrato). "ODP" è
-- una relation MULTIPLA (un Carico può contenere più Schede) → tabella giunzione carichi_schede,
-- non una colonna. "Documenti" è un allegato files genuino, ma senza alcun upload path nell'app
-- attuale (solo letto, mai scritto) — nessuna colonna Drive dedicata, solo il conteggio legacy per
-- il fallback verso /api/files/[pageId], stesso pattern delle altre fasi.
--
-- Stato/Modalità erano status/select a opzioni fisse — replicati come CHECK.
CREATE TABLE IF NOT EXISTS carichi (
  id              UUID PRIMARY KEY,
  titolo          TEXT NOT NULL DEFAULT '',
  descrizione     TEXT NOT NULL DEFAULT '',
  data_carico     DATE,
  commessa_id     UUID REFERENCES commesse(id),
  modalita        TEXT NOT NULL DEFAULT '' CHECK (modalita IN ('', 'Gomma', 'Aerea', 'Nave')),
  stato           TEXT NOT NULL DEFAULT 'Pianificato' CHECK (stato IN ('Pianificato', 'Confermato', 'Spedito')),
  archiviato      BOOLEAN NOT NULL DEFAULT false,
  legacy_documenti_count INT NOT NULL DEFAULT 0,
  creato_il       TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornato_il   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carichi_commessa ON carichi(commessa_id);
CREATE INDEX IF NOT EXISTS idx_carichi_stato ON carichi(stato);
CREATE INDEX IF NOT EXISTS idx_carichi_archiviato ON carichi(archiviato);

-- Relation "ODP" (Schede incluse nel Carico) — multipla, quindi tabella giunzione invece di una
-- colonna, stesso pattern delle altre relation many-to-many già normalizzate nel progetto.
CREATE TABLE IF NOT EXISTS carichi_schede (
  carico_id UUID NOT NULL REFERENCES carichi(id) ON DELETE CASCADE,
  scheda_id UUID NOT NULL REFERENCES schede(id) ON DELETE CASCADE,
  PRIMARY KEY (carico_id, scheda_id)
);
CREATE INDEX IF NOT EXISTS idx_carichi_schede_scheda ON carichi_schede(scheda_id);
