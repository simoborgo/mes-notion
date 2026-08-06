-- Fase 4 anagrafica Ferramenta: campi mancanti per compliance col file OS1
-- (INVENTARIO 30.06.2026 - Anagrafica collanti - ferramenta - mat.consumo.xlsx).
--
-- prezzo_ultimo_acquisto è deliberatamente distinto da prezzo_riferimento (esistente,
-- aggiornato automaticamente dal webhook Wurth per il controllo scostamenti sui nuovi
-- ordini) — questo è lo snapshot statico del prezzo OS1 al momento dell'import.

ALTER TABLE articoli_ferramenta
  ADD COLUMN IF NOT EXISTS inventariato BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS descrizione_categoria TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS categoria_merceologica TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cod_inv TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS prezzo_ultimo_acquisto NUMERIC(10,4);

CREATE INDEX IF NOT EXISTS idx_articoli_ferramenta_descrizione_categoria ON articoli_ferramenta(descrizione_categoria);
CREATE INDEX IF NOT EXISTS idx_articoli_ferramenta_inventariato ON articoli_ferramenta(inventariato) WHERE inventariato = true;
