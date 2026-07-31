-- Gestione Ordini Wurth: prezzo di riferimento su articoli_ferramenta + staging tracciati.
-- Additivo, non tocca gli schemi Ferramenta esistenti (schema_ferramenta*.sql).

ALTER TABLE articoli_ferramenta ADD COLUMN IF NOT EXISTS prezzo_riferimento NUMERIC(10,4);
ALTER TABLE articoli_ferramenta ADD COLUMN IF NOT EXISTS prezzo_riferimento_aggiornato_il TIMESTAMPTZ;
-- Descrizione così come la scrive il fornitore nei tracciati (spesso diversa dalla nostra
-- descrizione interna/OS1) — aggiornata automaticamente dal webhook ad ogni match, solo per
-- consultazione umana in fase di revisione, non usata dal matching (che resta su codice).
ALTER TABLE articoli_ferramenta ADD COLUMN IF NOT EXISTS descrizione_fornitore TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS wurth_ordini (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_ordine          TEXT NOT NULL,
  data_ordine            DATE,
  data_consegna_prevista DATE,
  stato_elaborazione     TEXT NOT NULL DEFAULT 'ricevuto', -- ricevuto | elaborato | errore
  errore                 TEXT,
  ricevuto_il            TIMESTAMPTZ NOT NULL DEFAULT now(),
  elaborato_il           TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wurth_ordini_numero ON wurth_ordini(numero_ordine);

-- codice_articolo resta il valore grezzo del tracciato (non normalizzato) — la normalizzazione
-- per il matching avviene solo in lettura, per poter sempre ricostruire il tracciato originale.
CREATE TABLE IF NOT EXISTS wurth_ordini_righe (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordine_id          UUID NOT NULL REFERENCES wurth_ordini(id) ON DELETE CASCADE,
  codice_articolo    TEXT NOT NULL,
  descrizione        TEXT NOT NULL DEFAULT '',
  quantita           NUMERIC(10,2) NOT NULL,
  prezzo_netto_pezzo NUMERIC(10,4) NOT NULL,
  articolo_id        UUID REFERENCES articoli_ferramenta(id),
  discrepanza_prezzo BOOLEAN NOT NULL DEFAULT false,
  creato_il          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wurth_righe_ordine ON wurth_ordini_righe(ordine_id);
