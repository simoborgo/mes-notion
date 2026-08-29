-- Fase 14: fix bug della migration fase12 — nel migrare i campi da `campionature` a
-- `schede_verniciatura` era stato dimenticato `drive_folder_id` (usato per la cartella Drive delle
-- foto campione), causando un errore "column drive_folder_id does not exist" al primo caricamento
-- foto su una scheda. Stesso trattamento che avrebbe dovuto avere già in fase12.
ALTER TABLE schede_verniciatura ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;
