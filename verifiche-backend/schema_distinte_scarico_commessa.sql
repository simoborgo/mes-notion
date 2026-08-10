-- Le Distinte di Scarico erano già "libere" (odp_id nullable, "distinta libera" se vuoto) ma
-- senza alcun aggancio a una Commessa specifica. Aggiunge un secondo riferimento opzionale,
-- alternativo a odp_id (mai entrambi popolati dalla UI, ma nessun vincolo DB lo impedisce:
-- la scelta è lasciata al form) — stesso pattern di odp_id/odp_label (Notion page id + label
-- denormalizzata, nessuna vera FK verso Notion).
ALTER TABLE distinte_scarico ADD COLUMN IF NOT EXISTS commessa_id TEXT;
ALTER TABLE distinte_scarico ADD COLUMN IF NOT EXISTS commessa_label TEXT;
