-- Fase 3: formula di miscelazione per Tinte (e in generale prodotti composti a formula fissa
-- e riutilizzabile, es. patine). A differenza degli ausiliari di cicli_fasi_prodotti (che
-- dipendono dal contesto d'uso: "quanto catalizzatore metto QUESTA volta"), una formula qui è
-- una proprietà fissa del prodotto stesso ("di cosa è fatta la Tinta Noce Scuro") — appartiene
-- all'anagrafica Vernici, non a una fase di un ciclo specifico. Auto-referenziata su vernici:
-- vernice_id è il prodotto composto (es. la Tinta), componente_id è un ingrediente (colorante,
-- concentrato, diluente, acetone, acqua...).
CREATE TABLE IF NOT EXISTS vernici_componenti_formula (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vernice_id    UUID NOT NULL REFERENCES vernici(id) ON DELETE CASCADE,
  componente_id UUID NOT NULL REFERENCES vernici(id),
  quantita      NUMERIC(10,3) NOT NULL CHECK (quantita > 0),
  unita         TEXT NOT NULL, -- libero: gr, ml, gocce, kg... (nessun vincolo, stesso approccio del resto dello schema)
  ordine        INT, -- ordine di aggiunta nella ricetta, per riproducibilità
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (vernice_id <> componente_id)
);

CREATE INDEX IF NOT EXISTS idx_vernici_componenti_formula_vernice ON vernici_componenti_formula(vernice_id);
CREATE INDEX IF NOT EXISTS idx_vernici_componenti_formula_componente ON vernici_componenti_formula(componente_id);
