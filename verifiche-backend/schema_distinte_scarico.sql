-- "Distinta di scarico": sessione di prelievo temporanea — il magazziniere apre una
-- distinta, cammina tra gli scaffali scansionando i QR (stesso form di scarico di sempre),
-- le righe restano in bozza (nessun movimento di magazzino) finché non si chiude la
-- distinta, che scarica tutto in un colpo solo. Concetto diverso da kit_ferramenta_righe
-- (quella è la distinta ATTESA/BOM per un ODP, vive per tutta la vita della scheda).
CREATE TABLE IF NOT EXISTS distinte_scarico (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odp_id      TEXT,          -- opzionale, Notion page id Scheda
  odp_label   TEXT,          -- denormalizzato per display
  stato       TEXT NOT NULL DEFAULT 'aperta' CHECK (stato IN ('aperta','chiusa','annullata')),
  aperta_da   TEXT NOT NULL,
  aperta_il   TIMESTAMPTZ NOT NULL DEFAULT now(),
  chiusa_il   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_distinte_scarico_stato ON distinte_scarico(stato) WHERE stato = 'aperta';

CREATE TABLE IF NOT EXISTS distinte_scarico_righe (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distinta_id  UUID NOT NULL REFERENCES distinte_scarico(id) ON DELETE CASCADE,
  articolo_id  UUID NOT NULL REFERENCES articoli_ferramenta(id),
  quantita     NUMERIC(10,2) NOT NULL CHECK (quantita > 0),
  scaricata    BOOLEAN NOT NULL DEFAULT false, -- true dopo la chiusura, rende "chiudi" ripetibile senza doppio scarico
  aggiunta_il  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_distinte_scarico_righe_distinta ON distinte_scarico_righe(distinta_id);
