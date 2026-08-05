-- Preventivo commerciale (Fase 2 modulo Offerte/Storico/Consuntivo/Previsionale).
-- Struttura testata/righe: un'offerta è quasi sempre una commessa con più articoli,
-- ognuno con le proprie ore preventivate — non un totale unico.
CREATE TABLE IF NOT EXISTS offerte (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commessa_id              TEXT,          -- Notion page id Commessa, nullable — valorizzato solo alla conferma
  cliente                  TEXT NOT NULL,
  valore_commessa          NUMERIC(12,2),
  data_offerta             DATE NOT NULL,
  stato                    TEXT NOT NULL DEFAULT 'Offerta' CHECK (stato IN ('Offerta','Confermata','Persa')),
  data_consegna_prevista   DATE,          -- stima se Offerta; sovrascritta da Commessa.dataCarico alla conferma
  probabilita_chiusura     NUMERIC(5,2) NOT NULL DEFAULT 40 CHECK (probabilita_chiusura >= 0 AND probabilita_chiusura <= 100),
  creato_da                TEXT NOT NULL,
  creato_il                TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornato_il            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offerte_stato ON offerte(stato);

-- Append-only: ripreventivare un articolo crea una nuova riga, mai un update su una esistente.
-- ore_preventivate_totali dell'offerta non si salva mai: sempre SUM(ore_preventivate) di qui.
CREATE TABLE IF NOT EXISTS offerte_righe (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offerta_id        UUID NOT NULL REFERENCES offerte(id) ON DELETE CASCADE,
  codice_articolo   TEXT NOT NULL REFERENCES articoli(codice_articolo),
  quantita          NUMERIC(10,2) NOT NULL CHECK (quantita > 0),
  ore_preventivate  NUMERIC(10,2) NOT NULL CHECK (ore_preventivate > 0),
  creato_il         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offerte_righe_offerta ON offerte_righe(offerta_id);
