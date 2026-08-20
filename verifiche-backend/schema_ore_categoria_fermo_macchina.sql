-- Nuovo codice speciale non legato a ODP: FERMO (Fermo Macchina), stesso principio di
-- SET/MNT/MEET/FORM/PUL — vedi ODP_SPECIALI in src/lib/attivitaSpecialiCommessa.ts.
ALTER TABLE ore_registrate DROP CONSTRAINT IF EXISTS ore_registrate_categoria_check;
ALTER TABLE ore_registrate ADD CONSTRAINT ore_registrate_categoria_check
  CHECK (categoria IN ('COMMESSA', 'SETUP', 'MANUTENZIONE', 'RIUNIONE', 'FORMAZIONE', 'PULIZIE', 'FERMO_MACCHINA'));
