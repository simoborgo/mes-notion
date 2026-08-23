-- Fase 3+4 del modulo APS: il motore di scheduling ha bisogno di una priorità per ODP
-- (algoritmo 4a: priorità -> EDD -> anzianità) che oggi non esiste da nessuna parte. Additiva,
-- default 'media' — nessun impatto sui flussi esistenti (Vista Oggi, Rilevamento Ore, ecc.).
ALTER TABLE schede ADD COLUMN IF NOT EXISTS priorita TEXT NOT NULL DEFAULT 'media'
  CHECK (priorita IN ('critica','alta','media','bassa'));
