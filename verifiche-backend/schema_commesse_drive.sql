-- Fase 4: aggiunge a commesse il riferimento alla propria cartella su Drive (root
-- COMMESSE_DRIVE_FOLDER_ID), popolato in modo lazy al primo upload di una Scheda collegata — non
-- subito alla creazione della Commessa, coerente con la decisione di toccare Drive solo per i
-- nuovi file. Persistere l'id (non il nome) permette di rinominare la cartella quando
-- numero/cliente/località cambiano, senza doverla ricercare per nome ogni volta.
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;
