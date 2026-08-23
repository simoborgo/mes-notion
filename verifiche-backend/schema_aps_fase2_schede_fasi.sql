-- Fase 2 del modulo APS: fasi per singola Scheda (ODP), affiancata a `schede` — che resta
-- invariata (fase_corrente/stato continuano a servire la UI operatore). Una riga per fase
-- effettivamente generata (le condizionali escluse dalla valutazione non producono riga).
-- Non include ancora il motore di scheduling (Fase 3/4): data_inizio_pianificata,
-- data_fine_pianificata, corsia, a_rischio restano NULL/false fino ad allora.

CREATE TABLE IF NOT EXISTS schede_fasi (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheda_id               UUID NOT NULL REFERENCES schede(id) ON DELETE CASCADE,
  pattern_ciclo_fase_id   UUID NOT NULL REFERENCES pattern_ciclo_fasi(id),
  reparto_id              TEXT NOT NULL REFERENCES reparti(id),
  ordine                  INT NOT NULL,
  sotto_fase              TEXT,
  ore_stimate             NUMERIC(10,2),
  stato_fase              TEXT NOT NULL DEFAULT 'Da iniziare'
                             CHECK (stato_fase IN ('Da iniziare','In lavorazione','Completato')),
  data_disponibilita       DATE,
  data_inizio_pianificata  DATE,
  data_fine_pianificata    DATE,
  corsia                   INT,
  a_rischio                BOOLEAN NOT NULL DEFAULT false,
  creato_il                TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornato_il            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scheda_id, ordine)
);
CREATE INDEX IF NOT EXISTS idx_schede_fasi_scheda ON schede_fasi(scheda_id);
CREATE INDEX IF NOT EXISTS idx_schede_fasi_reparto ON schede_fasi(reparto_id);
