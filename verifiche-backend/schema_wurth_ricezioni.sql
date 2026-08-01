-- Ordini Wurth -> carico a giacenza alla ricezione del materiale. Additivo, non tocca
-- schema_wurth_ordini.sql né gli schemi Ferramenta esistenti.

-- I carichi generati da una ricezione Wurth vanno distinti nello storico movimenti da un
-- carico manuale generico ("mes") — amplia il vincolo esistente su movimenti_ferramenta.fonte.
ALTER TABLE movimenti_ferramenta DROP CONSTRAINT IF EXISTS movimenti_ferramenta_fonte_check;
ALTER TABLE movimenti_ferramenta ADD CONSTRAINT movimenti_ferramenta_fonte_check CHECK (fonte IN ('mes', 'webhook_notion', 'wurth'));

ALTER TABLE wurth_ordini_righe ADD COLUMN IF NOT EXISTS codice_abarre TEXT;
ALTER TABLE wurth_ordini_righe ADD COLUMN IF NOT EXISTS quantita_ricevuta NUMERIC(10,2) NOT NULL DEFAULT 0;

-- in_attesa | parziale | evaso | evaso_manuale
ALTER TABLE wurth_ordini ADD COLUMN IF NOT EXISTS stato_ricezione TEXT NOT NULL DEFAULT 'in_attesa';

-- Audit: una riga per ogni evento di ricezione (consegne parziali multiple sulla stessa riga ordine)
CREATE TABLE IF NOT EXISTS wurth_ordini_righe_ricezioni (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  riga_id                   UUID NOT NULL REFERENCES wurth_ordini_righe(id) ON DELETE CASCADE,
  quantita                  NUMERIC(10,2) NOT NULL CHECK (quantita > 0),
  codice_abarre_scansionato TEXT,
  verifica_ok               BOOLEAN, -- NULL = nessuna scansione fatta, non un mancato controllo
  movimento_id              UUID NOT NULL, -- riferimento a movimenti_ferramenta.id (carico generato)
  operatore                 TEXT NOT NULL,
  ricevuto_il               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wurth_ricezioni_riga ON wurth_ordini_righe_ricezioni(riga_id);
