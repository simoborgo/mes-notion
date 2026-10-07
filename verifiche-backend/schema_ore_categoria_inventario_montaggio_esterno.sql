-- Nuovi codici speciali non legati a ODP: INV (Inventario), MONTAGGIO EST (Montaggi Esterni),
-- stesso principio di SET/MNT/MEET/FORM/PUL/ARR/FERMO — vedi ODP_SPECIALI in
-- src/lib/attivitaSpecialiCommessa.ts. Stesso vincolo da allargare per lo stesso motivo delle
-- migrazioni precedenti (schema_ore_categoria_arredi_masselli.sql): senza questo, ogni scrittura
-- con odp che inizia per "INV" o "MONTAGGIO EST" fallisce con "violates check constraint
-- ore_registrate_categoria_check" e manda in ROLLBACK l'intera transazione.
ALTER TABLE ore_registrate DROP CONSTRAINT IF EXISTS ore_registrate_categoria_check;
ALTER TABLE ore_registrate ADD CONSTRAINT ore_registrate_categoria_check
  CHECK (categoria IN ('COMMESSA', 'SETUP', 'MANUTENZIONE', 'RIUNIONE', 'FORMAZIONE', 'PULIZIE', 'FERMO_MACCHINA', 'ARREDI_MASSELLI', 'INVENTARIO', 'MONTAGGIO_ESTERNO'));
