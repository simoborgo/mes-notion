-- Magazzino Bordi (bordatura pannelli): prima categoria, dopo Vernici, a riusare il motore di
-- magazzino generico condiviso (movimenti_magazzino/inventari_magazzino, vedi
-- schema_magazzino_generico.sql) invece di uno schema dedicato come Ferramenta — stesso schema
-- di giacenza libera, carico/scarico, inventario periodico, nessuna soglia di riordino. Vedi
-- PROSSIME_IMPLEMENTAZIONI.md righe 12-76 per il piano.
--
-- Nessun file/foglio Excel "Bordi" disponibile ancora da OS1 (a differenza di Ferramenta/
-- Collanti): campi scelti sulla tipicità nota della categoria (spessore, altezza/larghezza,
-- decor/colore, materiale), creazione manuale via UI finché non arriva un export da mappare.

CREATE TABLE IF NOT EXISTS bordi (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codice              TEXT,                 -- codice interno/OS1, nullable finché non c'è import
  decor_codice        TEXT,                 -- codice decor/colore (es. abbinato al pannello)
  decor_nome          TEXT,                 -- descrizione decor/colore
  materiale           TEXT,                 -- libero: ABS, PVC, Melaminico, Impiallacciato, ecc.
  spessore_mm         NUMERIC(5,2),
  altezza_mm          NUMERIC(6,2),         -- larghezza del bordo (mm)
  finitura            TEXT,                 -- libero: opaco, lucido, goffrato, soft-touch...
  fornitore           TEXT,                 -- informativo, come vernici.fornitore (no FK)
  codice_fornitore    TEXT,
  codice_inventario   TEXT,                 -- chiave futura per QR/etichette, non usata in v1
  unita_misura        TEXT CHECK (unita_misura IN ('ML', 'MT', 'NR')),
  giacenza_attuale    NUMERIC(12,3) NOT NULL DEFAULT 0,
  cliente_riferimento TEXT,
  attivo              BOOLEAN NOT NULL DEFAULT true,
  segnalata_uso_il    TIMESTAMPTZ,          -- stesso pattern "da inventariare" di Vernici
  created_by          TEXT,
  updated_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bordi_codice_inventario ON bordi(codice_inventario) WHERE codice_inventario IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bordi_decor_codice ON bordi(decor_codice);
CREATE INDEX IF NOT EXISTS idx_bordi_materiale ON bordi(materiale);
CREATE INDEX IF NOT EXISTS idx_bordi_attivo ON bordi(attivo);

-- Estende il motore generico alla categoria 'bordi' (stesso pattern di
-- schema_ferramenta_inventario_ambito_inventariato.sql per le CHECK di categoria/ambito).
ALTER TABLE movimenti_magazzino DROP CONSTRAINT IF EXISTS movimenti_magazzino_categoria_check;
ALTER TABLE movimenti_magazzino ADD CONSTRAINT movimenti_magazzino_categoria_check
  CHECK (categoria IN ('vernici', 'bordi'));

ALTER TABLE inventari_magazzino DROP CONSTRAINT IF EXISTS inventari_magazzino_categoria_check;
ALTER TABLE inventari_magazzino ADD CONSTRAINT inventari_magazzino_categoria_check
  CHECK (categoria IN ('vernici', 'bordi'));

-- Ambito inventario per Bordi resta solo 'tutto' in questa fase, già ammesso dalla CHECK
-- esistente su inventari_magazzino.ambito — nessuna modifica necessaria lì.
