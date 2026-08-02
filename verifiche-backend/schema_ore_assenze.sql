-- Assenze manuali/riconciliate per Rilevamento Ore.
-- Separata da ore_registrate: un'assenza non è ore lavorate, non deve
-- inquinare le query di reportistica (getKpiTotali, getKpiPerOdp, ecc.)
-- che sommano solo ore effettivamente lavorate.
CREATE TABLE IF NOT EXISTS ore_assenze (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data                   DATE NOT NULL,
  matricola              TEXT NOT NULL,
  ore                    NUMERIC(4,2),          -- NULL = intera giornata
  modificata_manualmente BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (data, matricola)
);
CREATE INDEX IF NOT EXISTS idx_ore_assenze_data ON ore_assenze(data);
