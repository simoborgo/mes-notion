-- Fase 5.3 modulo Gestione Ore avanzato (Previsionale): timestamp immutabile di conferma,
-- usato come inizio della distribuzione mensile delle ore per un'offerta Confermata.
-- NON riusare aggiornato_il: quel campo cambia anche per modifiche successive alla conferma
-- (aggiornaCampiOfferta non blocca la modifica di un'offerta già Confermata).
ALTER TABLE offerte ADD COLUMN IF NOT EXISTS confermato_il TIMESTAMPTZ;
