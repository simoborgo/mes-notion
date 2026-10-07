-- Storico dei periodi "in forza" di un operatore: può averne più d'uno nel tempo (tipico degli
-- esterni, assunti/cessati più volte). "In forza alla data X" = esiste un periodo che copre X,
-- non più il solo booleano operatori.in_forza (che riflette solo lo stato odierno).
CREATE TABLE IF NOT EXISTS operatori_periodi_impiego (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operatore_id  UUID NOT NULL REFERENCES operatori(id),
  data_inizio   DATE NOT NULL,
  data_fine     DATE,              -- NULL = periodo tuttora aperto
  creato_il     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_periodi_operatore ON operatori_periodi_impiego(operatore_id);
CREATE INDEX IF NOT EXISTS idx_periodi_range ON operatori_periodi_impiego(data_inizio, data_fine);

-- Backfill: un periodo a testa per gli operatori esistenti, senza alterare retroattivamente lo
-- stato di nessuno. data_inizio molto nel passato = "sempre stato in forza prima d'ora" (storico
-- reale ignoto). Per chi è già cessato oggi, aggiornato_il è la miglior stima disponibile della
-- data di cessazione.
INSERT INTO operatori_periodi_impiego (operatore_id, data_inizio, data_fine)
SELECT id, DATE '2000-01-01', CASE WHEN in_forza THEN NULL ELSE aggiornato_il::date END
FROM operatori
WHERE NOT EXISTS (
  SELECT 1 FROM operatori_periodi_impiego p WHERE p.operatore_id = operatori.id
);
