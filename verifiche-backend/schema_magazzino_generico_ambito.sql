-- Ambito di apertura inventario, oltre a 'tutto': permette di contare solo un sottoinsieme
-- (es. solo una Tipologia di vernice, o un colore/codice). ambito_valore porta il valore scelto
-- (es. "Fondo poliuretanico" per tipologia, un testo di ricerca per colore_codice) — NULL se
-- ambito='tutto'. Ogni categoria usa il proprio vocabolario di ambiti (qui quelli di Vernici);
-- una categoria futura con esigenze diverse (es. "posizione") estenderà semplicemente questa CHECK.
ALTER TABLE inventari_magazzino DROP CONSTRAINT IF EXISTS inventari_magazzino_ambito_check;
ALTER TABLE inventari_magazzino ADD CONSTRAINT inventari_magazzino_ambito_check
  CHECK (ambito IN ('tutto', 'tipologia', 'colore_codice'));

ALTER TABLE inventari_magazzino ADD COLUMN IF NOT EXISTS ambito_valore TEXT;
