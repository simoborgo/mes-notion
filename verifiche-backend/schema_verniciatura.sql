-- Modulo Verniciatura: vernici (incl. ausiliari di processo), cicli/schede di verniciatura
-- (fasi ordinate con vernice/i + ausiliari e percentuali), campionature cliente con barcode.
-- Nessuna tabella Fornitori Postgres esiste oggi (Fornitori resta su Notion per la Ferramenta,
-- vedi PROSSIME_IMPLEMENTAZIONI.md) — Verniciatura introduce una propria tabella `laboratori`
-- con FK vera, usata sia per il fornitore vernice sia per il laboratorio tintometrico.

CREATE TABLE IF NOT EXISTS laboratori (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  note          TEXT,
  attivo        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_laboratori_nome ON laboratori(nome);
CREATE INDEX IF NOT EXISTS idx_laboratori_attivo ON laboratori(attivo);

-- Copre sia vernici colore sia ausiliari di processo (catalizzatori, diluenti, induritori,
-- additivi): differenziati tramite famiglia_prodotto/ruolo, non da una tabella separata.
CREATE TABLE IF NOT EXISTS vernici (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colore_sistema        TEXT CHECK (colore_sistema IN ('RAL', 'NCS', 'Pantone', 'Custom')), -- NULL per ausiliari
  colore_codice         TEXT, -- normalizzato dal backend prima dell'insert
  colore_nome           TEXT,
  fornitore_id          UUID REFERENCES laboratori(id), -- nullable: import legacy, assegnazione progressiva
  laboratorio_id        UUID REFERENCES laboratori(id), -- stessa tabella, ruolo diverso
  codice_tintometro     TEXT, -- codice strumento fornitore/laboratorio
  codice_vendita        TEXT,
  codice_inventario     TEXT, -- da "Cod. inventario" CSV; chiave verso eventuale anagrafica magazzino futura
  unita_misura          TEXT CHECK (unita_misura IN ('KG', 'LT', 'NR')), -- solo anagrafica, nessuna gestione giacenze
  famiglia_prodotto     TEXT NOT NULL, -- libero: OPACO, LUCIDO, FONDO, FINITURA, SMALTO, CATALIZZATORE, DILUENTE, ...
  ruolo                 TEXT CHECK (ruolo IN ('fondo', 'finitura', 'trasparente')), -- NULL per righe ausiliarie
  finitura              TEXT, -- es. opaco/lucido/satinato, libero
  gloss                 TEXT, -- es. "40 GLOSS"
  tipo_bilancio_massa   TEXT CHECK (tipo_bilancio_massa IN ('solvente', 'acqua', 'polvere', 'primer', 'smalto', 'altro')), -- classificazione VOC decodificata
  bilancio_massa_raw    TEXT, -- sigla grezza dal CSV (M/F/E/D/B/G/H/N/Q/L/A/NO/0...), mappatura da completare
  drive_folder_id       TEXT,
  ts_drive_file_id      TEXT, -- presenza scheda tecnica = IS NOT NULL
  sds_drive_file_id     TEXT, -- presenza scheda sicurezza = IS NOT NULL
  attivo                BOOLEAN NOT NULL DEFAULT true,
  created_by            TEXT,
  updated_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vernici_fornitore_lab_tintometro ON vernici(fornitore_id, laboratorio_id, codice_tintometro);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vernici_codice_inventario ON vernici(codice_inventario) WHERE codice_inventario IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vernici_colore_codice ON vernici(colore_codice);
CREATE INDEX IF NOT EXISTS idx_vernici_famiglia_ruolo ON vernici(famiglia_prodotto, ruolo);
CREATE INDEX IF NOT EXISTS idx_vernici_fornitore ON vernici(fornitore_id);
CREATE INDEX IF NOT EXISTS idx_vernici_attivo ON vernici(attivo);

-- Scheda di verniciatura. Nessuna distinzione standard/variante: ogni ciclo è concreto fin
-- dall'inizio (ogni fase ha sempre almeno una vernice, vedi cicli_fasi_prodotti).
-- validato_da_campionatura_id referenzia campionature, creata più sotto: FK aggiunta in coda
-- al file per evitare il riferimento circolare in fase di CREATE TABLE.
CREATE TABLE IF NOT EXISTS cicli (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                          TEXT, -- etichetta libera, es. "Armadio Gucci laccato"
  ciclo_padre_id                UUID REFERENCES cicli(id), -- self-reference per derivazioni/versioni
  stato                         TEXT NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza', 'validato')), -- monotono: mai validato -> bozza
  versione                      INT NOT NULL DEFAULT 1,
  validato_at                   TIMESTAMPTZ,
  validato_da_campionatura_id   UUID,
  note                          TEXT, -- sempre modificabile, anche a ciclo validato
  attivo                        BOOLEAN NOT NULL DEFAULT true,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cicli_padre ON cicli(ciclo_padre_id);
CREATE INDEX IF NOT EXISTS idx_cicli_stato ON cicli(stato);
CREATE INDEX IF NOT EXISTS idx_cicli_attivo ON cicli(attivo);

-- Passaggio della scheda, in ordine (es. fondo -> sfumatura -> finitura).
CREATE TABLE IF NOT EXISTS cicli_fasi (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id      UUID NOT NULL REFERENCES cicli(id) ON DELETE CASCADE,
  ordine        INT NOT NULL,
  nome_fase     TEXT, -- etichetta libera del passaggio
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cicli_fasi_ciclo_ordine ON cicli_fasi(ciclo_id, ordine);

-- Composizione di una fase: una o più vernici principali + eventuali ausiliari
-- (catalizzatore/diluente/indurente/additivo), ciascuno con percentuale.
CREATE TABLE IF NOT EXISTS cicli_fasi_prodotti (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fase_id         UUID NOT NULL REFERENCES cicli_fasi(id) ON DELETE CASCADE,
  vernice_id      UUID NOT NULL REFERENCES vernici(id),
  ruolo_in_fase   TEXT NOT NULL CHECK (ruolo_in_fase IN ('vernice', 'catalizzatore', 'diluente', 'indurente', 'additivo', 'altro')),
  percentuale     NUMERIC(6,2) CHECK (percentuale > 0), -- riferita al totale delle vernici principali della fase (tipicamente 1kg)
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cicli_fasi_prodotti_fase_vernice_ruolo ON cicli_fasi_prodotti(fase_id, vernice_id, ruolo_in_fase);
CREATE INDEX IF NOT EXISTS idx_cicli_fasi_prodotti_vernice ON cicli_fasi_prodotti(vernice_id);
CREATE INDEX IF NOT EXISTS idx_cicli_fasi_prodotti_fase ON cicli_fasi_prodotti(fase_id);

-- Campionatura cliente con barcode fisico (codice_pubblico). Flusso produzione:
-- scan barcode -> campionatura (foto+esito+data) -> ciclo (fasi) -> vernici (codici, TS, SDS).
CREATE TABLE IF NOT EXISTS campionature (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id                        UUID NOT NULL REFERENCES cicli(id),
  cliente                         TEXT NOT NULL, -- validato contro enum applicativa, non FK
  codice_campione_materialista     TEXT, -- riferimento incrociato dal tintometro, non chiave
  codice_pubblico                  TEXT NOT NULL, -- non UNIQUE: riuso intenzionale per stesso cliente/vernici
  data_campionatura                DATE NOT NULL DEFAULT CURRENT_DATE,
  esito                            TEXT NOT NULL DEFAULT 'in_revisione' CHECK (esito IN ('approvato', 'rifiutato', 'in_revisione')),
  note                             TEXT,
  drive_folder_id                  TEXT,
  attivo                           BOOLEAN NOT NULL DEFAULT true,
  validato_at                      TIMESTAMPTZ, -- quando esito passa ad approvato
  created_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campionature_codice_pubblico ON campionature(codice_pubblico);
CREATE INDEX IF NOT EXISTS idx_campionature_cliente ON campionature(cliente);
CREATE INDEX IF NOT EXISTS idx_campionature_ciclo ON campionature(ciclo_id);
CREATE INDEX IF NOT EXISTS idx_campionature_esito ON campionature(esito);
CREATE INDEX IF NOT EXISTS idx_campionature_attivo ON campionature(attivo);

CREATE TABLE IF NOT EXISTS campionature_foto (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campionatura_id   UUID NOT NULL REFERENCES campionature(id) ON DELETE CASCADE,
  drive_file_id     TEXT NOT NULL,
  nome_file         TEXT,
  ordine            INT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_campionature_foto_campionatura_file ON campionature_foto(campionatura_id, drive_file_id);

-- Sequenza atomica per la generazione del barcode (codice_pubblico = PREFISSO-ANNO-CONTATORE).
CREATE TABLE IF NOT EXISTS contatori_barcode_cliente (
  cliente     TEXT NOT NULL,
  anno        INT NOT NULL,
  contatore   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (cliente, anno)
);

-- FK circolare cicli.validato_da_campionatura_id -> campionature(id), aggiunta ora che
-- entrambe le tabelle esistono. Idempotente: salta se il vincolo è già presente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_cicli_validato_da_campionatura'
  ) THEN
    ALTER TABLE cicli
      ADD CONSTRAINT fk_cicli_validato_da_campionatura
      FOREIGN KEY (validato_da_campionatura_id) REFERENCES campionature(id);
  END IF;
END $$;
