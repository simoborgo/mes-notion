-- Causali rifacimento "F — Fornitore" (aggiunta lato codice in 21497e8 senza allargare il
-- vincolo) e "CA — Cantiere" (C è già Cliente), vedi OreCausale in src/lib/oreRepository.ts.
-- Senza questo, classificare un rifacimento come F o CA falliva con "violates check constraint
-- ore_registrate_causale_check".
ALTER TABLE ore_registrate DROP CONSTRAINT IF EXISTS ore_registrate_causale_check;
ALTER TABLE ore_registrate ADD CONSTRAINT ore_registrate_causale_check
  CHECK (causale IN ('P', 'T', 'M', 'C', 'F', 'CA'));
