-- Audit leggero per "Scarico Materiale": logistica notifica che sta portando
-- materiale in produzione (foto + PDF Scheda su Telegram, via notifiche_inviate
-- già esistente). Nessuna foto salvata qui — servono solo su Telegram.
CREATE TABLE IF NOT EXISTS scarichi_materiale (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operatore     TEXT NOT NULL,
  scheda_id     TEXT,
  odp_label     TEXT,
  descrizione   TEXT NOT NULL,
  creato_il     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scarichi_materiale_data ON scarichi_materiale(creato_il);
