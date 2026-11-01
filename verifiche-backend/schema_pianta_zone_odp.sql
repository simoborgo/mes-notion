-- Le zone della pianta si agganciano direttamente all'ODP (scheda), non più all'Area.
-- area_id resta in tabella ma non è più usato: si può eliminare con
--   ALTER TABLE pianta_zone DROP COLUMN area_id;
-- una volta verificato che non serve.

ALTER TABLE pianta_zone ADD COLUMN IF NOT EXISTS scheda_id UUID REFERENCES schede(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pianta_zone_scheda ON pianta_zone(scheda_id);
