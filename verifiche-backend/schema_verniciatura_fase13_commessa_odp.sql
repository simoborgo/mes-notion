-- Fase 13: collegamenti "soft" (FK nullable, mai bloccanti) tra Scheda di Verniciatura e
-- produzione, su richiesta dell'utente (2026-08-29) — per poter risalire a "per quale commessa è
-- nata" una scheda/ricetta di verniciatura e "su quali ODP è stata poi effettivamente usata".
--
-- 1) commessa_id: commessa di origine, fissa dalla creazione ed ereditata da generaFiglio (stesso
--    trattamento di cliente_id) — serve anche a precompilare il Cliente in UI alla creazione.
ALTER TABLE schede_verniciatura ADD COLUMN IF NOT EXISTS commessa_id UUID REFERENCES commesse(id);
CREATE INDEX IF NOT EXISTS idx_schede_verniciatura_commessa ON schede_verniciatura(commessa_id);

-- 2) scheda_verniciatura_id su schede (ODP): un ODP referenzia una sola scheda di verniciatura,
--    una scheda di verniciatura può essere referenziata da molti ODP — cardinalità 1:N richiesta,
--    senza tabella ponte. Si imposta lato ODP (tab "Verniciatura" nel dettaglio ODP).
ALTER TABLE schede ADD COLUMN IF NOT EXISTS scheda_verniciatura_id UUID REFERENCES schede_verniciatura(id);
CREATE INDEX IF NOT EXISTS idx_schede_scheda_verniciatura ON schede(scheda_verniciatura_id);
