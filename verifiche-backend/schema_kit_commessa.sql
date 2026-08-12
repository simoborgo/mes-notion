-- Kit Commessa: lista di ferramenta legata a una Commessa (non a un singolo ODP), pensata per
-- liste "già scritte" fornite dall'Ufficio Tecnico (a mano, da Excel, o con un PDF di riferimento
-- allegato) — stesso comportamento del Kit Ferramenta ODP (conferma → notifica magazziniere →
-- il magazziniere verifica/spunta), ma righe libere: articolo_id è opzionale, la descrizione
-- vive sempre sulla riga stessa (non solo via JOIN), perché il "codice Modar" non è vincolante.
CREATE TABLE IF NOT EXISTS kit_commessa (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commessa_id                   TEXT NOT NULL,
  commessa_label                TEXT,
  stato                         TEXT NOT NULL DEFAULT 'aperto' CHECK (stato IN ('aperto', 'chiuso')),
  pdf_riferimento_drive_file_id TEXT,
  pdf_riferimento_nome          TEXT,
  aperto_da                     TEXT NOT NULL,
  aperto_il                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  confermato_il                 TIMESTAMPTZ,
  chiuso_da                     TEXT,
  chiuso_il                     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_kit_commessa_commessa ON kit_commessa(commessa_id);
CREATE INDEX IF NOT EXISTS idx_kit_commessa_stato ON kit_commessa(stato);

-- Righe: articolo_id NULL = descrittiva/libera, mai scaricata automaticamente. Quando il
-- magazziniere la spunta collegandola a un articolo (subito o al volo), movimento_id traccia
-- il movimento di magazzino generato — spuntata senza articolo_id: solo checklist, nessun tocco
-- alla giacenza. Stesso principio di denormalizzazione di kit_ferramenta_righe.
CREATE TABLE IF NOT EXISTS kit_commessa_righe (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_commessa_id UUID NOT NULL REFERENCES kit_commessa(id) ON DELETE CASCADE,
  descrizione     TEXT NOT NULL,
  articolo_id     UUID REFERENCES articoli_ferramenta(id),
  codice_os1      TEXT,
  quantita        NUMERIC(10,2) NOT NULL CHECK (quantita > 0),
  spuntata_da     TEXT,
  spuntata_il     TIMESTAMPTZ,
  movimento_id    UUID REFERENCES movimenti_ferramenta(id),
  creato_il       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kit_commessa_righe_kit ON kit_commessa_righe(kit_commessa_id);
