-- Estensione movimenti_ferramenta: tag ODP opzionale (foglio di scarico) + tipo 'rettifica' (inventario)
ALTER TABLE movimenti_ferramenta ADD COLUMN IF NOT EXISTS odp_id TEXT;
ALTER TABLE movimenti_ferramenta ADD COLUMN IF NOT EXISTS odp_label TEXT;
CREATE INDEX IF NOT EXISTS idx_movimenti_odp ON movimenti_ferramenta(odp_id, creato_il) WHERE odp_id IS NOT NULL;

ALTER TABLE movimenti_ferramenta DROP CONSTRAINT IF EXISTS movimenti_ferramenta_tipo_check;
ALTER TABLE movimenti_ferramenta ADD CONSTRAINT movimenti_ferramenta_tipo_check
  CHECK (tipo IN ('scarico_kanban', 'scarico_a_pezzo', 'carico', 'rettifica'));

-- La rettifica ha un delta con segno (può essere negativo o zero); scarico/carico restano sempre positivi
ALTER TABLE movimenti_ferramenta DROP CONSTRAINT IF EXISTS movimenti_ferramenta_quantita_check;
ALTER TABLE movimenti_ferramenta ADD CONSTRAINT movimenti_ferramenta_quantita_check
  CHECK ( (tipo <> 'rettifica' AND quantita > 0) OR (tipo = 'rettifica') );

-- Sessioni di inventario a riconteggio — una sola aperta alla volta a livello globale
CREATE TABLE IF NOT EXISTS inventari_ferramenta (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stato         TEXT NOT NULL DEFAULT 'aperto' CHECK (stato IN ('aperto', 'chiuso')),
  ambito        TEXT NOT NULL CHECK (ambito IN ('tutto', 'kanban', 'ubicazione', 'sotto_scorta')),
  ambito_valore TEXT,                      -- valorizzato solo se ambito = 'ubicazione'
  aperto_da     TEXT NOT NULL,
  aperto_il     TIMESTAMPTZ NOT NULL DEFAULT now(),
  chiuso_da     TEXT,
  chiuso_il     TIMESTAMPTZ,
  note          TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventario_singolo_aperto
  ON inventari_ferramenta(stato) WHERE stato = 'aperto';

-- Righe di conteggio, snapshot degli articoli inclusi nell'ambito al momento dell'apertura.
-- giacenza_teorica è solo per la UI "proposta": il delta reale va sempre calcolato al momento
-- del conteggio contro la giacenza Notion fresca, non contro questo snapshot.
CREATE TABLE IF NOT EXISTS inventario_righe_ferramenta (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id      UUID NOT NULL REFERENCES inventari_ferramenta(id) ON DELETE CASCADE,
  articolo_id        TEXT NOT NULL,
  codice_os1         TEXT,
  descrizione        TEXT,
  giacenza_teorica   NUMERIC(10,2) NOT NULL,
  giacenza_contata   NUMERIC(10,2),
  scostamento        NUMERIC(10,2) GENERATED ALWAYS AS (giacenza_contata - giacenza_teorica) STORED,
  contato_da         TEXT,
  contato_il         TIMESTAMPTZ,
  movimento_id       UUID REFERENCES movimenti_ferramenta(id),
  creato_il          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inventario_id, articolo_id)
);

CREATE INDEX IF NOT EXISTS idx_inventario_righe_inventario ON inventario_righe_ferramenta(inventario_id);
CREATE INDEX IF NOT EXISTS idx_inventario_righe_da_contare ON inventario_righe_ferramenta(inventario_id) WHERE giacenza_contata IS NULL;
