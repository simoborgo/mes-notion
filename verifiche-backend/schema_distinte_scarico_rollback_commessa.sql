-- Rollback: la Commessa e la conferma+notifica sono state spostate al nuovo Kit Commessa
-- (kit_commessa/kit_commessa_righe), separato dalle Distinte di Scarico — che tornano a essere
-- solo lo strumento di raccolta/scarico via QR, con ODP facoltativo, come prima di questa sessione.
ALTER TABLE distinte_scarico DROP COLUMN IF EXISTS commessa_id;
ALTER TABLE distinte_scarico DROP COLUMN IF EXISTS commessa_label;
ALTER TABLE distinte_scarico DROP COLUMN IF EXISTS confermata_il;
