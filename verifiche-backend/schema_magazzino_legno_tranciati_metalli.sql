-- Magazzino Legname, Tranciati, Profili Metallici: stesso pattern di schema_magazzino_bordi.sql
-- (motore di magazzino generico condiviso, anagrafiche separate per categoria). Collanti restano
-- dentro Ferramenta (articoli_ferramenta), non hanno un proprio magazzino qui.
--
-- Nessun file/foglio Excel disponibile per nessuna delle tre categorie: campi scelti sulla
-- tipicità nota di ciascun reparto, creazione manuale via UI finché non arriva un export da
-- mappare.

CREATE TABLE IF NOT EXISTS legni (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codice              TEXT,
  essenza             TEXT,                 -- specie legno: Rovere, Faggio, Noce Canaletto, Abete...
  qualita             TEXT,                 -- scelta/qualità: Prima scelta, Nodato...
  spessore_mm         NUMERIC(6,2),
  larghezza_mm        NUMERIC(7,2),
  lunghezza_mm        NUMERIC(8,2),
  fornitore           TEXT,
  codice_fornitore    TEXT,
  codice_inventario   TEXT,
  unita_misura        TEXT CHECK (unita_misura IN ('M3', 'MQ', 'ML', 'NR')),
  giacenza_attuale    NUMERIC(12,3) NOT NULL DEFAULT 0,
  cliente_riferimento TEXT,
  attivo              BOOLEAN NOT NULL DEFAULT true,
  segnalata_uso_il    TIMESTAMPTZ,
  created_by          TEXT,
  updated_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_legni_codice_inventario ON legni(codice_inventario) WHERE codice_inventario IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_legni_essenza ON legni(essenza);
CREATE INDEX IF NOT EXISTS idx_legni_attivo ON legni(attivo);

CREATE TABLE IF NOT EXISTS tranciati (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codice              TEXT,
  essenza             TEXT,
  qualita             TEXT,
  spessore_mm         NUMERIC(5,2),         -- tipicamente sottile, es. 0.6
  larghezza_mm        NUMERIC(7,2),
  lunghezza_mm        NUMERIC(8,2),
  fornitore           TEXT,
  codice_fornitore    TEXT,
  codice_inventario   TEXT,
  unita_misura        TEXT CHECK (unita_misura IN ('MQ', 'NR', 'KG')),
  giacenza_attuale    NUMERIC(12,3) NOT NULL DEFAULT 0,
  cliente_riferimento TEXT,
  attivo              BOOLEAN NOT NULL DEFAULT true,
  segnalata_uso_il    TIMESTAMPTZ,
  created_by          TEXT,
  updated_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tranciati_codice_inventario ON tranciati(codice_inventario) WHERE codice_inventario IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tranciati_essenza ON tranciati(essenza);
CREATE INDEX IF NOT EXISTS idx_tranciati_attivo ON tranciati(attivo);

CREATE TABLE IF NOT EXISTS profili_metallici (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codice              TEXT,
  tipo_profilo        TEXT,                 -- Maniglia, Profilo strutturale, Guida scorrevole...
  materiale           TEXT,                 -- Alluminio, Acciaio, Inox, Ottone...
  sezione             TEXT,                 -- es. "20x20mm", testo libero (non un singolo numero)
  lunghezza_mm        NUMERIC(8,2),         -- barra standard, es. 6000
  finitura            TEXT,                 -- anodizzato, verniciato, grezzo...
  colore              TEXT,
  fornitore           TEXT,
  codice_fornitore    TEXT,
  codice_inventario   TEXT,
  unita_misura        TEXT CHECK (unita_misura IN ('ML', 'NR', 'KG')),
  giacenza_attuale    NUMERIC(12,3) NOT NULL DEFAULT 0,
  cliente_riferimento TEXT,
  attivo              BOOLEAN NOT NULL DEFAULT true,
  segnalata_uso_il    TIMESTAMPTZ,
  created_by          TEXT,
  updated_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_profili_metallici_codice_inventario ON profili_metallici(codice_inventario) WHERE codice_inventario IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profili_metallici_tipo ON profili_metallici(tipo_profilo);
CREATE INDEX IF NOT EXISTS idx_profili_metallici_attivo ON profili_metallici(attivo);

-- Estende il motore generico alle tre categorie (stesso pattern di schema_magazzino_bordi.sql).
ALTER TABLE movimenti_magazzino DROP CONSTRAINT IF EXISTS movimenti_magazzino_categoria_check;
ALTER TABLE movimenti_magazzino ADD CONSTRAINT movimenti_magazzino_categoria_check
  CHECK (categoria IN ('vernici', 'bordi', 'legno', 'tranciati', 'profili_metallici'));

ALTER TABLE inventari_magazzino DROP CONSTRAINT IF EXISTS inventari_magazzino_categoria_check;
ALTER TABLE inventari_magazzino ADD CONSTRAINT inventari_magazzino_categoria_check
  CHECK (categoria IN ('vernici', 'bordi', 'legno', 'tranciati', 'profili_metallici'));

-- Ambito inventario resta solo 'tutto' per tutte e tre in questa fase, già ammesso dalla CHECK
-- esistente su inventari_magazzino.ambito — nessuna modifica necessaria lì.
