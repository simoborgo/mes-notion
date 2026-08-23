-- Esclusione manuale di una fase APS da una Scheda (es. il pattern standard non si applica
-- esattamente a quell'ODP) — soft, mai un DELETE, reversibile via lo stesso flag.
ALTER TABLE schede_fasi ADD COLUMN IF NOT EXISTS esclusa BOOLEAN NOT NULL DEFAULT false;
