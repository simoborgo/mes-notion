-- Chi fa il trasporto di un movimento di Ritiri e Consegne. Nel 90% dei casi è il camion Modar; a
-- volte è il fornitore a portare o a venire a prendere il materiale. Si può dichiarare in anticipo
-- (la logistica lo vede ma non lo deve programmare) oppure al momento con "Fatto dal fornitore",
-- che chiude il movimento direttamente in Fatto.
ALTER TABLE ritiri ADD COLUMN IF NOT EXISTS trasporto TEXT NOT NULL DEFAULT 'Modar'
  CHECK (trasporto IN ('Modar', 'Fornitore'));
