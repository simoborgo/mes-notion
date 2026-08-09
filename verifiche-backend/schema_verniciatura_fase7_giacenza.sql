-- Fase 7: aggiunge la gestione giacenze a Vernici (finora solo anagrafica di produzione). Il
-- conteggio a riconteggio periodico vive nel motore di magazzino generico
-- (movimenti_magazzino/inventari_magazzino, categoria='vernici', vedi schema_magazzino_generico.sql),
-- non qui: questa colonna è lo stato corrente denormalizzato, scritto da
-- verniciRepository.aggiornaGiacenzaVernice().
ALTER TABLE vernici ADD COLUMN IF NOT EXISTS giacenza_attuale NUMERIC(12,3) NOT NULL DEFAULT 0;

COMMENT ON COLUMN vernici.unita_misura IS 'Unità di misura della giacenza (KG/LT/NR) — usata anche da movimenti_magazzino/carico-scarico, non solo anagrafica.';
