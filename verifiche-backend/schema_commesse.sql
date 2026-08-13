-- Commesse + Aree: migrate da Notion (NOTION_DB_COMMESSE, NOTION_DB_AREE). id riusa il Notion
-- page id esistente, così i riferimenti testuali già scritti altrove (Scheda."Commessa Nr",
-- Scheda."Area-Cartella Commessa" su Notion, kit_commessa.commessa_id, verifiche_spedizione, ecc.)
-- restano validi senza remapping.
--
-- "Responsabile" su Notion è multi_select (più persone), non testo semplice come il mapper
-- pageToCommessa lasciava intuire (getText() non gestisce multi_select e tornava sempre "") — qui
-- diventa testo con i nomi uniti da ", ", correggendo un campo che in pratica era sempre vuoto.
--
-- giorni_montaggio NON è una colonna: era una formula Notion (fine_montaggio - inizio_montaggio in
-- giorni, verificato sui dati reali), va ricalcolata in query.
CREATE TABLE IF NOT EXISTS commesse (
  id                UUID PRIMARY KEY,
  numero_commessa   TEXT NOT NULL,
  cliente           TEXT NOT NULL DEFAULT '',
  localita          TEXT NOT NULL DEFAULT '',
  info              TEXT NOT NULL DEFAULT '',
  responsabile      TEXT NOT NULL DEFAULT '',
  stato             TEXT NOT NULL DEFAULT 'ShopDrawing'
                      CHECK (stato IN ('ShopDrawing', 'In produzione', 'In spedizione', 'In montaggio', 'Chiusa')),
  data_carico       DATE,
  inizio_montaggio  DATE,
  fine_montaggio    DATE,
  creato_il         TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornato_il     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commesse_numero ON commesse(numero_commessa);
CREATE INDEX IF NOT EXISTS idx_commesse_stato ON commesse(stato);

-- CLIENTE, Stato Commessa, Località Cliente su Notion erano rollup che mirroravano semplicemente
-- Commessa.cliente/.stato/.localita — qui si leggono via JOIN, non si duplicano (elimina alla
-- radice il rischio di disallineamento già visto con Fornitori/fornitore_nome). CommessaCliente
-- (formula "@numero - cliente - localita") e Completamento (mai scritto da nessuna parte del
-- codice, calcolato lato app dalle Schede reali) non sono mai stati letti dall'app: non migrati.
CREATE TABLE IF NOT EXISTS aree (
  id                     UUID PRIMARY KEY,
  commessa_id            UUID NOT NULL REFERENCES commesse(id),
  nome_arredo            TEXT NOT NULL DEFAULT '',
  codice_articolo_a      TEXT NOT NULL DEFAULT '',
  data_consegna_prevista DATE,
  descrizione            TEXT NOT NULL DEFAULT '',
  note                   TEXT NOT NULL DEFAULT '',
  posizione              TEXT NOT NULL DEFAULT '',
  quantita               NUMERIC,
  stato_produzione       TEXT NOT NULL DEFAULT '',
  creato_il              TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornato_il          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aree_commessa ON aree(commessa_id);
