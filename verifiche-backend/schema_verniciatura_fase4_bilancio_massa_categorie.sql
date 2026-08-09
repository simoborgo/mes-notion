-- Fase 4: mappatura reale sigla -> categoria per il Bilancio di Massa, da "TABELLA CATEGORIE
-- VERNICI.pdf" fornita dall'utente. Sostituisce l'enum ipotizzato inizialmente in fase di
-- progettazione (solvente/acqua/polvere/primer/smalto/altro, mai usato in produzione) con le
-- 12 categorie realmente in uso in azienda.
ALTER TABLE vernici DROP CONSTRAINT IF EXISTS vernici_tipo_bilancio_massa_check;
ALTER TABLE vernici ADD CONSTRAINT vernici_tipo_bilancio_massa_check
  CHECK (tipo_bilancio_massa IN (
    'ACETONE',
    'DILUENTE',
    'VERNICE ALL''ACQUA',
    'CATALIZZATORE ACRILICO',
    'VERNICE ACRILICA',
    'FONDO ACRILICO',
    'CATALIZZATORE POLIURETANICO',
    'VERNICE POLIURETANICA',
    'FONDO POLIURETANICO',
    'FONDO POLIESTERE',
    'VERNICE NITRO',
    'TINTA SOLVENTE'
  ));

-- Backfill: decodifica bilancio_massa_raw (sigla single-char o "NO") -> tipo_bilancio_massa,
-- solo dove non ancora decodificato. La sigla "0" (zero, 2 righe) non è nella tabella di
-- riferimento: resta non decodificata (tipo_bilancio_massa NULL, bilancio_massa_raw="0").
UPDATE vernici SET tipo_bilancio_massa = CASE bilancio_massa_raw
  WHEN 'A'  THEN 'ACETONE'
  WHEN 'F'  THEN 'DILUENTE'
  WHEN 'B'  THEN 'VERNICE ALL''ACQUA'
  WHEN 'D'  THEN 'CATALIZZATORE ACRILICO'
  WHEN 'G'  THEN 'VERNICE ACRILICA'
  WHEN 'L'  THEN 'FONDO ACRILICO'
  WHEN 'E'  THEN 'CATALIZZATORE POLIURETANICO'
  WHEN 'H'  THEN 'VERNICE POLIURETANICA'
  WHEN 'N'  THEN 'FONDO POLIURETANICO'
  WHEN 'M'  THEN 'FONDO POLIESTERE'
  WHEN 'NO' THEN 'VERNICE NITRO'
  WHEN 'Q'  THEN 'TINTA SOLVENTE'
  ELSE NULL
END
WHERE tipo_bilancio_massa IS NULL AND bilancio_massa_raw IS NOT NULL;
