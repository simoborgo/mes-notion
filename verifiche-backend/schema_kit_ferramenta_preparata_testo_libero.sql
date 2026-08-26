-- Una riga a testo libero (articolo_id NULL) non ha giacenza da scaricare: il pulsante "Scarica"
-- della pagina Foglio di Scarico puntava comunque a /ferramenta/scarico/[articoloId] con
-- articoloId nullo, dando errore (bug segnalato dall'utente 2026-08-26). Per queste righe serve
-- solo una conferma manuale "è stato preparato/reperito", senza toccare alcuna giacenza — stesso
-- principio già in uso in kit_commessa_righe (spuntata_da/spuntata_il) per il caso testo libero.
ALTER TABLE kit_ferramenta_righe ADD COLUMN IF NOT EXISTS preparata_da TEXT;
ALTER TABLE kit_ferramenta_righe ADD COLUMN IF NOT EXISTS preparata_il TIMESTAMPTZ;
