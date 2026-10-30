-- Finestra di produzione della Commessa: inizio_produzione si inserisce a mano quando arrivano i
-- disegni; fine_produzione di norma coincide con il carico / la fine montaggio, ma resta un dato
-- manuale (la dashboard mostra il carico solo come riferimento quando è vuota, senza salvarlo).
-- Colonne additive e nullable: nessun backfill, nessuna data inventata per le commesse esistenti.
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS inizio_produzione DATE;
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS fine_produzione DATE;

-- Rete di sicurezza come per schede_fasi: un intervallo invertito non deve mai poter essere scritto.
ALTER TABLE commesse DROP CONSTRAINT IF EXISTS chk_commesse_finestra_produzione;
ALTER TABLE commesse ADD CONSTRAINT chk_commesse_finestra_produzione
  CHECK (inizio_produzione IS NULL OR fine_produzione IS NULL OR fine_produzione >= inizio_produzione);
