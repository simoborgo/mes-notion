-- Motore di magazzino generico condiviso tra tutte le categorie di materiale
-- (Vernici oggi; Legname/Tranciato/Bordi/Metalli in futuro). Le anagrafiche restano tabelle
-- Postgres separate per categoria — qui vivono solo movimenti e sessioni di inventario,
-- agnostici rispetto all'anagrafica: entita_id è l'UUID della riga anagrafica di quella
-- categoria (es. vernici.id), mai un nome tabella dinamico. Ferramenta resta sul proprio
-- schema separato (movimenti_ferramenta/inventari_ferramenta), non va migrata qui.
--
-- Ogni categoria futura richiede solo una micro-migrazione che estenda le CHECK sotto
-- (ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT, stesso pattern già visto in
-- schema_ferramenta_inventario_ambito_inventariato.sql) — altrimenti l'INSERT fallisce con 23514.

CREATE TABLE IF NOT EXISTS movimenti_magazzino (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria             TEXT NOT NULL CHECK (categoria IN ('vernici')),
  entita_id             UUID NOT NULL,
  codice                TEXT,                   -- denormalizzato per leggibilità (es. colore_codice)
  tipo                  TEXT NOT NULL CHECK (tipo IN ('carico', 'scarico', 'rettifica')),
  quantita              NUMERIC(12,3) NOT NULL CHECK ( (tipo <> 'rettifica' AND quantita > 0) OR (tipo = 'rettifica') ),
  giacenza_precedente   NUMERIC(12,3) NOT NULL,
  giacenza_risultante   NUMERIC(12,3) NOT NULL,
  operatore             TEXT NOT NULL,
  fonte                 TEXT NOT NULL DEFAULT 'mes' CHECK (fonte IN ('mes')),
  note                  TEXT,
  creato_il             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movimenti_magazzino_entita ON movimenti_magazzino(categoria, entita_id, creato_il);

-- Una sola sessione aperta PER CATEGORIA (non globale: magazzini fisicamente diversi,
-- addetti diversi — un inventario Vernici aperto non deve bloccare un futuro inventario Legname).
CREATE TABLE IF NOT EXISTS inventari_magazzino (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria     TEXT NOT NULL CHECK (categoria IN ('vernici')),
  stato         TEXT NOT NULL DEFAULT 'aperto' CHECK (stato IN ('aperto', 'chiuso')),
  ambito        TEXT NOT NULL DEFAULT 'tutto' CHECK (ambito IN ('tutto')),
  aperto_da     TEXT NOT NULL,
  aperto_il     TIMESTAMPTZ NOT NULL DEFAULT now(),
  chiuso_da     TEXT,
  chiuso_il     TIMESTAMPTZ,
  note          TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventario_magazzino_aperto_per_categoria
  ON inventari_magazzino(categoria) WHERE stato = 'aperto';

-- giacenza_teorica è solo la proposta in UI: il delta reale si calcola sempre contro la
-- giacenza fresca dell'anagrafica al momento del conteggio, non contro questo snapshot.
CREATE TABLE IF NOT EXISTS inventario_righe_magazzino (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id      UUID NOT NULL REFERENCES inventari_magazzino(id) ON DELETE CASCADE,
  entita_id          UUID NOT NULL,
  codice             TEXT,
  descrizione        TEXT,
  giacenza_teorica   NUMERIC(12,3) NOT NULL,
  giacenza_contata   NUMERIC(12,3),
  scostamento        NUMERIC(12,3) GENERATED ALWAYS AS (giacenza_contata - giacenza_teorica) STORED,
  contato_da         TEXT,
  contato_il         TIMESTAMPTZ,
  movimento_id       UUID REFERENCES movimenti_magazzino(id),
  creato_il          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inventario_id, entita_id)
);

CREATE INDEX IF NOT EXISTS idx_inventario_righe_magazzino_inventario ON inventario_righe_magazzino(inventario_id);
CREATE INDEX IF NOT EXISTS idx_inventario_righe_magazzino_da_contare ON inventario_righe_magazzino(inventario_id) WHERE giacenza_contata IS NULL;
