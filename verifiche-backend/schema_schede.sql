-- Schede di Produzione (ODP, Sottoschede, Rilavorazioni) migrate da Notion (NOTION_DB_SCHEDE).
-- id riusa il Notion page id esistente — fondamentale qui più che altrove: decine di tabelle già
-- su Postgres referenziano una Scheda solo per id testuale (kit_ferramenta_righe.odp_id,
-- verifiche_spedizione.notion_page_id, standard_reparto, ore_registrate.odp, ecc.) — riusando lo
-- stesso id, tutti quei riferimenti restano validi senza remapping.
--
-- Stato/Fase Corrente/Tipologia/Stato Produzione Esterna erano tutti Notion "select" a opzioni
-- fisse (verificato via API schema, non assunto dal mapper) — replicati come CHECK.
--
-- File: PDF Allegato/Ordine Fornitore/Foto erano liste additive su Notion (mai sostituite, solo
-- aggiunte — vedi append*ToScheda in notion.ts), quindi diventano tabelle figlie come scheda_foto,
-- non colonne singole. Copertina invece sostituisce (mai accumula), resta una colonna sulla riga.
-- I nuovi upload vanno solo su Drive (decisione presa con l'utente); i file già esistenti restano
-- su storage Notion (URL firmati, scadono dopo un'ora) — legacy_*_count cattura quanti ce n'erano
-- al momento della migrazione (congelato, mai più letto da Notion in seguito), usato solo per
-- decidere se mostrare il fallback verso il proxy /api/files/[pageId] quando non c'è ancora nessun
-- file su Drive per quella Scheda.
CREATE TABLE IF NOT EXISTS schede (
  id                        UUID PRIMARY KEY,
  odp                       TEXT NOT NULL,
  numero_scheda             TEXT NOT NULL DEFAULT '',
  tipologia                 TEXT NOT NULL DEFAULT 'Scheda'
                               CHECK (tipologia IN ('Scheda', 'Sottoscheda', 'Rilavorazione')),
  stato                     TEXT NOT NULL DEFAULT 'Da Iniziare'
                               CHECK (stato IN ('Da Iniziare', 'In lavorazione', 'In lavorazione Esterna',
                                 'Materiale Pronto', 'Verificato', 'Completato', 'In Attesa Rilavorazione',
                                 'In attesa materiale', 'Produzione Bloccata', 'Annullata', 'Revisione UTT')),
  fase_corrente             TEXT NOT NULL DEFAULT ''
                               CHECK (fase_corrente IN ('', 'Sviluppo Distinte', 'Sezionatura', 'Lavorazione CNC',
                                 'Preassemblaggio', 'Verniciatura', 'Montaggio finale', 'Controllo Qualità')),
  descrizione_fasi          TEXT NOT NULL DEFAULT '', -- "Descrizione/Fasi/Piano/Stanza" — anche usato come note libere
  codice_articolo           TEXT NOT NULL DEFAULT '',
  posizione                 TEXT NOT NULL DEFAULT '',
  quantita                  NUMERIC,
  data_scheda_ricevuta      DATE,
  data_produzione_prevista  DATE,
  produzione_esterna        BOOLEAN NOT NULL DEFAULT false,
  stato_prod_esterna        TEXT NOT NULL DEFAULT ''
                               CHECK (stato_prod_esterna IN ('', 'Da Ordinare', 'Da Inviare', 'In Lavorazione',
                                 'Rientrato', 'In attesa Preventivo', 'Fornitore in attesa materiale')),
  fornitore_id              UUID REFERENCES fornitori(id),
  data_rientro_prevista     DATE,
  data_uscita_materiale     DATE,
  data_rientro_effettiva    DATE,
  commessa_id               UUID REFERENCES commesse(id),
  area_id                   UUID REFERENCES aree(id),
  parent_id                 UUID REFERENCES schede(id),
  kit_ferramenta            TEXT NOT NULL DEFAULT '' CHECK (kit_ferramenta IN ('', 'Si', 'No')),
  descrizione_kit_ferramenta TEXT NOT NULL DEFAULT '',
  note_stato                TEXT NOT NULL DEFAULT '',
  archiviata                BOOLEAN NOT NULL DEFAULT false,
  copertina_drive_id        TEXT,
  legacy_pdf_allegato_count      INT NOT NULL DEFAULT 0,
  legacy_ordine_fornitore_count  INT NOT NULL DEFAULT 0,
  legacy_foto_count              INT NOT NULL DEFAULT 0,
  legacy_copertina                BOOLEAN NOT NULL DEFAULT false,
  creato_il                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornato_il              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schede_odp ON schede(odp);
CREATE INDEX IF NOT EXISTS idx_schede_commessa ON schede(commessa_id);
CREATE INDEX IF NOT EXISTS idx_schede_area ON schede(area_id);
CREATE INDEX IF NOT EXISTS idx_schede_parent ON schede(parent_id);
CREATE INDEX IF NOT EXISTS idx_schede_tipologia ON schede(tipologia);
CREATE INDEX IF NOT EXISTS idx_schede_stato ON schede(stato);
CREATE INDEX IF NOT EXISTS idx_schede_archiviata ON schede(archiviata);

-- Tabelle figlie per le liste di allegati (stesso pattern normalizzato di verifiche_foto) — righe
-- qui sono sempre nuovi upload su Drive, mai backfill dei file storici Notion.
CREATE TABLE IF NOT EXISTS scheda_pdf_allegato (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheda_id     UUID NOT NULL REFERENCES schede(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL,
  nome          TEXT NOT NULL DEFAULT '',
  ordine        INT NOT NULL DEFAULT 0,
  creato_il     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheda_pdf_allegato_scheda ON scheda_pdf_allegato(scheda_id, ordine);

CREATE TABLE IF NOT EXISTS scheda_ordine_fornitore (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheda_id     UUID NOT NULL REFERENCES schede(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL,
  nome          TEXT NOT NULL DEFAULT '',
  ordine        INT NOT NULL DEFAULT 0,
  creato_il     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheda_ordine_fornitore_scheda ON scheda_ordine_fornitore(scheda_id, ordine);

CREATE TABLE IF NOT EXISTS scheda_foto (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheda_id     UUID NOT NULL REFERENCES schede(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL,
  ordine        INT NOT NULL DEFAULT 0,
  creato_il     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheda_foto_scheda ON scheda_foto(scheda_id, ordine);
