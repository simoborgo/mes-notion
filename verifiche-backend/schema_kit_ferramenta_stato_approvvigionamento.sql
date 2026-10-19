-- Il magazziniere deve poter segnalare perché un componente del Kit Ferramenta ODP non è ancora
-- pronto (Ordinato con data di arrivo / Consegna parziale / In attesa risposta fornitore) e
-- marcare come "non serve" un componente richiesto ma non necessario. NULL = nessuna segnalazione.
ALTER TABLE kit_ferramenta_righe ADD COLUMN IF NOT EXISTS stato_approvvigionamento TEXT
  CHECK (stato_approvvigionamento IN ('ordinato', 'consegna_parziale', 'attesa_fornitore'));
ALTER TABLE kit_ferramenta_righe ADD COLUMN IF NOT EXISTS in_arrivo_il DATE;
ALTER TABLE kit_ferramenta_righe ADD COLUMN IF NOT EXISTS non_necessaria BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE kit_ferramenta_righe ADD COLUMN IF NOT EXISTS non_necessaria_da TEXT;
ALTER TABLE kit_ferramenta_righe ADD COLUMN IF NOT EXISTS non_necessaria_il TIMESTAMPTZ;
