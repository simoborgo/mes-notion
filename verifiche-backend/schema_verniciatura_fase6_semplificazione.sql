-- Fase 6: semplificazione anagrafica Vernici su richiesta dell'utente — il modulo era diventato
-- complicato da usare in pratica.
--   1) ruolo (fondo/finitura/trasparente): mai popolato in pratica, rimosso.
--   2) fornitore_id + laboratorio_id (FK a `laboratori`) erano ridondanti: un solo campo
--      `fornitore` testo libero, in futuro collegato alla vera tabella Fornitori condivisa
--      (non ancora esistente) — nel frattempo la tabella `laboratori` e tutta la sua UI/API
--      vengono rimosse.
--   3) colore_sistema (RAL/NCS/Pantone/Custom): non serve più come campo a sé, resta solo
--      colore_codice testo libero (già ben normalizzato dall'import, il dato non si perde).
--   4) famiglia_prodotto rinominato in tipologia (corrisponde a "Tipo Vernice" nel file excel
--      di origine — nome più chiaro per chi usa il modulo).

ALTER TABLE vernici DROP COLUMN IF EXISTS ruolo;
DROP INDEX IF EXISTS idx_vernici_famiglia_ruolo;

ALTER TABLE vernici ADD COLUMN IF NOT EXISTS fornitore TEXT;
UPDATE vernici v SET fornitore = COALESCE(
  (SELECT nome FROM laboratori WHERE id = v.fornitore_id),
  (SELECT nome FROM laboratori WHERE id = v.laboratorio_id)
) WHERE fornitore IS NULL AND (v.fornitore_id IS NOT NULL OR v.laboratorio_id IS NOT NULL);

DROP INDEX IF EXISTS idx_vernici_fornitore;
ALTER TABLE vernici DROP COLUMN IF EXISTS fornitore_id;
ALTER TABLE vernici DROP COLUMN IF EXISTS laboratorio_id;
DROP TABLE IF EXISTS laboratori;

ALTER TABLE vernici DROP COLUMN IF EXISTS colore_sistema;

ALTER TABLE vernici RENAME COLUMN famiglia_prodotto TO tipologia;
