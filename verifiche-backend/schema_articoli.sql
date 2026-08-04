-- Anagrafica articoli/prodotti (Fase 1 del modulo Offerte/Storico/Previsionale) — non
-- confondere con articoli_ferramenta (minuteria/ferramenta): questi sono i prodotti finiti
-- venduti in commessa (es. "ANTA-BOISERIE-NOCE-01"), usati come chiave per Offerte_Righe,
-- Standard_Reparto e Storico_Consuntivo_Articolo.
CREATE TABLE IF NOT EXISTS articoli (
  codice_articolo TEXT PRIMARY KEY,
  descrizione     TEXT NOT NULL,
  categoria       TEXT,          -- es. "Ante", "Boiserie", "Cassettiere" — fallback % reparto quando manca uno storico consuntivo
  creato_il       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_articoli_categoria ON articoli(categoria);

-- Reparto secondario per i pochi operatori polivalenti (documento Gestione Ore, sezione 3a).
-- Nessuna UI dedicata per ora: gestita via query dirette finché non emerge un bisogno concreto.
CREATE TABLE IF NOT EXISTS operatori_reparto_secondario (
  matricola          TEXT PRIMARY KEY,
  reparto_secondario TEXT NOT NULL,
  percentuale        NUMERIC(5,2) NOT NULL CHECK (percentuale > 0 AND percentuale <= 100),
  aggiornato_il      TIMESTAMPTZ NOT NULL DEFAULT now()
);
