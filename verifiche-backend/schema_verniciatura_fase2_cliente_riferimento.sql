-- Fase 2: recupero informazione cliente dal catalogo CSV originale (ETICHETTE_VERNICI_estratto.csv),
-- persa durante il primo import perché la decisione iniziale era "Vernici indipendente dal
-- cliente" — solo Campionature ha un vero legame strutturale col cliente (colonna `cliente`,
-- validata contro l'enum). Qui è puramente informativo/storico: finché non esistono ancora
-- cicli e campionature reali per una vernice migrata dal CSV, questo è l'unico modo per
-- risalire a quale cliente era associata in origine. Nessun vincolo/CHECK: può contenere anche
-- valori fuori dall'enum CLIENTI_VERNICIATURA (l'enum vive solo lato applicativo per Campionature).
ALTER TABLE vernici
  ADD COLUMN IF NOT EXISTS cliente_riferimento TEXT;

CREATE INDEX IF NOT EXISTS idx_vernici_cliente_riferimento ON vernici(cliente_riferimento) WHERE cliente_riferimento IS NOT NULL;
