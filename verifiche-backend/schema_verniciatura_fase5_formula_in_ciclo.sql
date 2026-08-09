-- Fase 5: la formula di una Tinta/Sfumatura NON è un prodotto riutilizzabile a sé stante
-- (vernici_componenti_formula, fase 3) — la distinta reale (DISTINTA PER CAMPIONI
-- VERNICIATURA.xlsx, fornita dall'utente 2026-08-09) mostra che ogni formula è specifica
-- della singola commessa/ciclo, reinventata di volta in volta, mai richiamata per nome da un
-- catalogo. Sposta la composizione dentro cicli_fasi_prodotti: percentuale -> quantita (numero
-- assoluto o percentuale, indistintamente) + unita (testo libero: %, gr, gocce, ml...).
DROP TABLE IF EXISTS vernici_componenti_formula;

ALTER TABLE cicli_fasi_prodotti RENAME COLUMN percentuale TO quantita;
ALTER TABLE cicli_fasi_prodotti ADD COLUMN IF NOT EXISTS unita TEXT;
-- Le eventuali righe già inserite con "percentuale" erano implicitamente in percentuale.
UPDATE cicli_fasi_prodotti SET unita = '%' WHERE quantita IS NOT NULL AND unita IS NULL;

-- La distinta reale porta sempre Essenza (specie legno) e Ignifuga (sì/no) insieme a
-- Commessa/Negozio — campi strutturati mancanti su Cicli.
ALTER TABLE cicli ADD COLUMN IF NOT EXISTS essenza TEXT;
ALTER TABLE cicli ADD COLUMN IF NOT EXISTS ignifuga BOOLEAN;
