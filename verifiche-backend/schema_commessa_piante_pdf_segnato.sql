-- PDF "segnato" della pianta (zone, tratti e bolli già disegnati, zone cliccabili verso le schede):
-- file su Drive nella cartella Documenti della commessa, rigenerato e sostituito a ogni "Fine
-- modifica". L'originale della pianta resta separato e invariato.

ALTER TABLE commessa_piante ADD COLUMN IF NOT EXISTS pdf_segnato_drive_id TEXT;
ALTER TABLE commessa_piante ADD COLUMN IF NOT EXISTS pdf_segnato_il TIMESTAMPTZ;
