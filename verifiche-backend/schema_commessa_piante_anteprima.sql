-- Miniatura JPEG (~40-80 KB) della pianta: la Panoramica commessa mostra questa invece di scaricare
-- e leggere l'intero PDF da Drive a ogni apertura.

ALTER TABLE commessa_piante ADD COLUMN IF NOT EXISTS anteprima BYTEA;
