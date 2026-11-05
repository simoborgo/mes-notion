-- Anagrafica Brand con logo, usata nei documenti interni (per ora la stampa Carichi commessa).
-- Il logo sta nel DB (pochi KB, stesso approccio della miniatura delle piante) così finisce
-- direttamente come data URI nell'HTML della stampa, senza dipendere da Drive.
-- `alias`: varianti di scrittura del cliente separate da virgola (es. "LV, Louis Vuitton"), usate
-- solo per SUGGERIRE il brand dal testo di commesse.cliente, mai per assegnarlo in automatico.
CREATE TABLE IF NOT EXISTS brand (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  alias         TEXT NOT NULL DEFAULT '',
  logo          BYTEA,
  logo_mime     TEXT,
  creato_il     TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_nome ON brand (lower(nome));

-- Il testo commesse.cliente resta invariato: brand_id è un legame in più, facoltativo.
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brand(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_commesse_brand ON commesse(brand_id);
