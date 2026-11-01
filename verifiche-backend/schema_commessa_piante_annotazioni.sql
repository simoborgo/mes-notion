-- Segni grafici sulla pianta (tratti evidenziatore e bolli OK/MANCA), stesso formato delle
-- verifiche di spedizione: per pagina, coordinate normalizzate 0–1. Una riga per pianta, salvata
-- in automatico; sostituendo il file della pianta i segni restano.

CREATE TABLE IF NOT EXISTS pianta_annotazioni (
  pianta_id     UUID PRIMARY KEY REFERENCES commessa_piante(id) ON DELETE CASCADE,
  strokes       JSONB NOT NULL DEFAULT '{}',
  stamps        JSONB NOT NULL DEFAULT '{}',
  aggiornato_da TEXT NOT NULL DEFAULT '',
  aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);
