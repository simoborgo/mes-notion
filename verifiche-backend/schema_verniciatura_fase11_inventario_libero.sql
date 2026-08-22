-- Fase 11: ambito "libero" per l'apertura inventario — l'operatore sceglie a mano quali vernici
-- includere (es. diluenti/ausiliari mai "segnalati" perché usati al volo, ma da ricontare
-- comunque ogni tanto), invece di un filtro automatico. Deciso con l'utente 2026-08-22.
ALTER TABLE inventari_magazzino DROP CONSTRAINT IF EXISTS inventari_magazzino_ambito_check;
ALTER TABLE inventari_magazzino ADD CONSTRAINT inventari_magazzino_ambito_check
  CHECK (ambito IN ('tutto', 'tipologia', 'colore_codice', 'movimentate', 'libero'));
