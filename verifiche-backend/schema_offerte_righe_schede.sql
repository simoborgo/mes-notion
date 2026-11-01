-- Collega ogni Scheda di produzione a una riga articolo dell'offerta (lista di kick-off), così si
-- misura l'avanzamento per riga: schede create, in produzione, completate. Una riga è "coperta"
-- quando ha almeno una scheda (ne può avere più d'una, nessun numero atteso).
-- ON DELETE SET NULL: se l'offerta viene eliminata le schede di produzione restano.
ALTER TABLE schede ADD COLUMN IF NOT EXISTS offerta_riga_id UUID REFERENCES offerte_righe(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_schede_offerta_riga ON schede(offerta_riga_id) WHERE offerta_riga_id IS NOT NULL;
