-- Fase 10: segnalazione di movimento "leggero" — un operatore può dichiarare di aver usato una
-- vernice senza ripesarla (niente carico/scarico preciso). Decisione con l'utente (2026-08-22):
-- il flag lo mette QUALSIASI movimento (segnalazione leggera O un vero carico/scarico, anche
-- preciso — è comunque un segnale che la vernice si è mossa), e si azzera SOLO con una conta
-- fisica al prossimo inventario (mai da un carico/scarico successivo, che non è una verifica
-- fisica). Usato per filtrare velocemente "solo le vernici movimentate" quando si apre un nuovo
-- inventario, invece di dover ricontare tutto il catalogo.
ALTER TABLE vernici ADD COLUMN IF NOT EXISTS segnalata_uso_il TIMESTAMPTZ;

-- Nuovo tipo movimento "segnalazione": quantità 0, giacenza invariata (non è un vero
-- carico/scarico, è solo una nota "l'ho usata" con operatore/orario tracciati come gli altri
-- movimenti).
ALTER TABLE movimenti_magazzino DROP CONSTRAINT IF EXISTS movimenti_magazzino_tipo_check;
ALTER TABLE movimenti_magazzino ADD CONSTRAINT movimenti_magazzino_tipo_check
  CHECK (tipo IN ('carico', 'scarico', 'rettifica', 'segnalazione'));

ALTER TABLE movimenti_magazzino DROP CONSTRAINT IF EXISTS movimenti_magazzino_check;
ALTER TABLE movimenti_magazzino ADD CONSTRAINT movimenti_magazzino_check
  CHECK ( (tipo IN ('carico', 'scarico') AND quantita > 0) OR (tipo IN ('rettifica', 'segnalazione')) );

-- Nuovo ambito di apertura inventario: solo le vernici col flag attivo.
ALTER TABLE inventari_magazzino DROP CONSTRAINT IF EXISTS inventari_magazzino_ambito_check;
ALTER TABLE inventari_magazzino ADD CONSTRAINT inventari_magazzino_ambito_check
  CHECK (ambito IN ('tutto', 'tipologia', 'colore_codice', 'movimentate'));
