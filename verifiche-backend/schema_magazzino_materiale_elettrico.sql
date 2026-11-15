-- Magazzino Materiale Elettrico: stesso pattern di schema_magazzino_legno_tranciati_metalli.sql
-- (motore di magazzino generico condiviso, anagrafica dedicata alla categoria).
--
-- Nessun file/foglio Excel disponibile: campi scelti sulla tipicità del materiale elettrico usato
-- negli arredi (cavi, alimentatori, strip LED, faretti, interruttori...), creazione manuale via UI
-- finché non arriva un export da mappare.

CREATE TABLE IF NOT EXISTS materiale_elettrico (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codice              TEXT,
  tipo_articolo       TEXT,                 -- Cavo, Alimentatore, Strip LED, Faretto, Interruttore...
  marca               TEXT,
  caratteristiche     TEXT,                 -- testo libero: "24V 60W IP20", "3x1,5 mmq"...
  descrizione         TEXT,
  colore              TEXT,
  fornitore           TEXT,
  codice_fornitore    TEXT,
  codice_inventario   TEXT,
  unita_misura        TEXT CHECK (unita_misura IN ('NR', 'ML', 'CF')),
  giacenza_attuale    NUMERIC(12,3) NOT NULL DEFAULT 0,
  cliente_riferimento TEXT,
  attivo              BOOLEAN NOT NULL DEFAULT true,
  segnalata_uso_il    TIMESTAMPTZ,
  created_by          TEXT,
  updated_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_materiale_elettrico_codice_inventario ON materiale_elettrico(codice_inventario) WHERE codice_inventario IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_materiale_elettrico_tipo ON materiale_elettrico(tipo_articolo);
CREATE INDEX IF NOT EXISTS idx_materiale_elettrico_attivo ON materiale_elettrico(attivo);

-- Estende il motore generico alla nuova categoria.
ALTER TABLE movimenti_magazzino DROP CONSTRAINT IF EXISTS movimenti_magazzino_categoria_check;
ALTER TABLE movimenti_magazzino ADD CONSTRAINT movimenti_magazzino_categoria_check
  CHECK (categoria IN ('vernici', 'bordi', 'legno', 'tranciati', 'profili_metallici', 'materiale_elettrico'));

ALTER TABLE inventari_magazzino DROP CONSTRAINT IF EXISTS inventari_magazzino_categoria_check;
ALTER TABLE inventari_magazzino ADD CONSTRAINT inventari_magazzino_categoria_check
  CHECK (categoria IN ('vernici', 'bordi', 'legno', 'tranciati', 'profili_metallici', 'materiale_elettrico'));
