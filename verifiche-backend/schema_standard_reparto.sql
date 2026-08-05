-- Fase 4 modulo Gestione Ore avanzato (Storico): quante ore ha davvero richiesto un
-- articolo per reparto, alimentato alla chiusura di ogni Scheda (statoProduzione -> "Completato").
-- Solo ore_registrate.rif = false conta: i rifacimenti non sono rappresentativi dello standard.

CREATE TABLE IF NOT EXISTS storico_consuntivo_articolo (
  odp             TEXT NOT NULL,          -- Scheda.odp / ore_registrate.odp, es. "MP26-433" — NON l'id pagina Notion
  reparto         TEXT NOT NULL,
  codice_articolo TEXT NOT NULL REFERENCES articoli(codice_articolo),
  ore             NUMERIC(10,2) NOT NULL,
  data_chiusura   DATE NOT NULL,
  PRIMARY KEY (odp, reparto)
);

CREATE TABLE IF NOT EXISTS standard_reparto (
  codice_articolo       TEXT NOT NULL REFERENCES articoli(codice_articolo),
  reparto               TEXT NOT NULL,
  media_ore             NUMERIC(10,4) NOT NULL,
  somma_scarti_quadrati NUMERIC(14,4) NOT NULL DEFAULT 0,
  n_osservazioni        INT NOT NULL DEFAULT 0,
  origine               TEXT NOT NULL CHECK (origine IN ('stimato','consuntivo')),
  aggiornato_il         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (codice_articolo, reparto)
);
