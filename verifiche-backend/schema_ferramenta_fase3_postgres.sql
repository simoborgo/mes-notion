-- Fase 3: migrazione anagrafica Ferramenta e Kit ODP da Notion a Postgres.
-- Notion resta la fonte di verità solo per Fornitori e Schede/ODP.

CREATE TABLE IF NOT EXISTS articoli_ferramenta (
  id                          UUID PRIMARY KEY, -- migrazione: id pagina Notion esistente; nuovi articoli: gen_random_uuid() esplicito all'insert
  codice_os1                  TEXT NOT NULL,
  descrizione                 TEXT NOT NULL DEFAULT '',
  unita_misura                TEXT NOT NULL DEFAULT '',
  fornitore_id                TEXT,                     -- Notion Fornitori page id, nessuna FK (Fornitori resta su Notion)
  fornitore_nome               TEXT NOT NULL DEFAULT '', -- denormalizzato, risolto in scrittura
  fornitore_nome_os1           TEXT NOT NULL DEFAULT '',
  codice_fornitore             TEXT NOT NULL DEFAULT '',
  metodo_gestione              TEXT CHECK (metodo_gestione IN ('Kanban', 'A Pezzo')),
  giacenza_attuale              NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantita_standard_vaschetta   NUMERIC(10,2),
  soglia_minima                 NUMERIC(10,2),
  attivo                        BOOLEAN NOT NULL DEFAULT true,
  note                          TEXT NOT NULL DEFAULT '',
  ubicazione                    TEXT, -- lista fissa in types.ts, tenuta libera per evitare ALTER futuri
  creato_il                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornato_il                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_articoli_ferramenta_codice_os1 ON articoli_ferramenta(codice_os1);
CREATE INDEX IF NOT EXISTS idx_articoli_ferramenta_attivo ON articoli_ferramenta(attivo);
CREATE INDEX IF NOT EXISTS idx_articoli_ferramenta_metodo ON articoli_ferramenta(metodo_gestione) WHERE metodo_gestione IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_articoli_ferramenta_descrizione ON articoli_ferramenta(descrizione);

-- Sostituisce NOTION_DB_KIT_FERRAMENTA_RIGHE. odp_id resta un riferimento testuale a una
-- pagina Notion (Schede restano su Notion) — stesso pattern già usato da movimenti_ferramenta.odp_id.
CREATE TABLE IF NOT EXISTS kit_ferramenta_righe (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odp_id        TEXT NOT NULL,
  articolo_id   UUID NOT NULL REFERENCES articoli_ferramenta(id),
  quantita      NUMERIC(10,2) NOT NULL CHECK (quantita > 0),
  creato_il     TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kit_righe_odp ON kit_ferramenta_righe(odp_id);
CREATE INDEX IF NOT EXISTS idx_kit_righe_articolo ON kit_ferramenta_righe(articolo_id);
