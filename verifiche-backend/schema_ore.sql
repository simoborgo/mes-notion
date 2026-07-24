-- Rilevamento Ore: una riga per ogni ODP lavorato da un operatore in un giorno
CREATE TABLE IF NOT EXISTS ore_registrate (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data          DATE NOT NULL,
  matricola     TEXT NOT NULL,                 -- DIP-xxxx, riferimento a Notion Personale
  cognome       TEXT NOT NULL,
  nome          TEXT NOT NULL,
  azienda       TEXT,
  reparto       TEXT,
  odp           TEXT NOT NULL,                 -- MPyy-xxx (+ eventuale /Rxx) oppure SET/MNT/MEET/FORM/PUL-xxx
  categoria     TEXT NOT NULL
                  CHECK (categoria IN ('COMMESSA', 'SETUP', 'MANUTENZIONE', 'RIUNIONE', 'FORMAZIONE', 'PULIZIE')),
  ore           NUMERIC(4,1) NOT NULL CHECK (ore > 0),
  rif           BOOLEAN NOT NULL DEFAULT false,
  causale       TEXT CHECK (causale IN ('P', 'T', 'M', 'C')),  -- valorizzata solo se rif = true
  note          TEXT,
  costo_rif     NUMERIC(8,2),                  -- ore * 41 se rif = true, altrimenti NULL
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un operatore non può avere due righe per lo stesso ODP nello stesso giorno:
-- "Aggiungi ODP lavorato" fa un upsert su questa chiave naturale.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ore_data_matricola_odp ON ore_registrate(data, matricola, odp);

CREATE INDEX IF NOT EXISTS idx_ore_data ON ore_registrate(data);
CREATE INDEX IF NOT EXISTS idx_ore_matricola ON ore_registrate(matricola, data);
CREATE INDEX IF NOT EXISTS idx_ore_odp ON ore_registrate(odp);
-- indice parziale per la vista "Rifacimenti da classificare"
CREATE INDEX IF NOT EXISTS idx_ore_rif_da_classificare ON ore_registrate(data) WHERE rif = true AND causale IS NULL;

DROP TRIGGER IF EXISTS trg_ore_updated_at ON ore_registrate;
CREATE TRIGGER trg_ore_updated_at
  BEFORE UPDATE ON ore_registrate
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Ultimo ODP usato da ogni operatore — pre-selezionato alla prossima apertura
CREATE TABLE IF NOT EXISTS ultimo_odp (
  matricola     TEXT PRIMARY KEY,
  ultimo_odp    TEXT NOT NULL,
  aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);
