-- Nuovo codice speciale non legato a ODP: ARR (Arredi e Masselli), stesso principio di
-- SET/MNT/MEET/FORM/PUL/FERMO — vedi ODP_SPECIALI in src/lib/attivitaSpecialiCommessa.ts.
-- Il vincolo non era stato allargato al momento di introdurre la categoria in codice: ogni
-- scrittura con odp che inizia per "ARR" falliva con "violates check constraint
-- ore_registrate_categoria_check", mandando in ROLLBACK l'intera transazione (segmento e ore
-- insieme) — un segmento su quell'ODP restava bloccato aperto per sempre, e ogni tentativo
-- successivo di chiuderlo (cambio ODP, webhook di fine turno) falliva allo stesso modo.
ALTER TABLE ore_registrate DROP CONSTRAINT IF EXISTS ore_registrate_categoria_check;
ALTER TABLE ore_registrate ADD CONSTRAINT ore_registrate_categoria_check
  CHECK (categoria IN ('COMMESSA', 'SETUP', 'MANUTENZIONE', 'RIUNIONE', 'FORMAZIONE', 'PULIZIE', 'FERMO_MACCHINA', 'ARREDI_MASSELLI'));
