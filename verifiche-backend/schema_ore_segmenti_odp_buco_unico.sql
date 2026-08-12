-- Marca i segmenti inseriti retroattivamente per coprire il buco tra l'inizio nominale del
-- turno e la conferma del primo ODP della giornata (registraSegmentoRetroattivo) e impedisce
-- che ce ne sia più di uno per operatore/giorno — stesso pattern già usato per garantire un
-- solo segmento aperto per operatore (indice univoco parziale), così un doppio tap o un retry
-- di rete non può più duplicare (e quindi contare due volte) le ore di quel periodo.
ALTER TABLE ore_segmenti_odp ADD COLUMN IF NOT EXISTS da_buco BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS ore_segmenti_odp_buco_unico ON ore_segmenti_odp (matricola, data) WHERE da_buco = true;
