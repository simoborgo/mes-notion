-- QR Code sulle schede: codice breve opaco (8 caratteri) stampato nel QR come /q/<codice>.
-- Si usa un codice dedicato invece dell'id interno (non esposto su carta) e invece dell'ODP (le
-- sottoschede condividono l'ODP del padre, quindi non identificherebbe il singolo PDF).
-- Additiva e nullable: le schede esistenti restano senza codice finché non si stampa la loro
-- etichetta (generazione lazy), nessun impatto sui flussi esistenti.
ALTER TABLE schede ADD COLUMN IF NOT EXISTS qr_codice TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS schede_qr_codice_uniq ON schede (qr_codice) WHERE qr_codice IS NOT NULL;
