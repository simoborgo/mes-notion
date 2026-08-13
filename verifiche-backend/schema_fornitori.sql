-- Fornitori: anagrafica migrata da Notion (NOTION_DB_FORNITORI). id riusa il Notion page id
-- esistente, così tutti i riferimenti testuali già scritti altrove (articoli_ferramenta.fornitore_id,
-- e — quando migreranno — Scheda.fornitoreId/Ritiro.fornitoreId) restano validi senza remapping.
-- Il DB Fornitori su Notion non ha un campo email: resta NULL finché non serve per le notifiche
-- (vedi PROSSIME_IMPLEMENTAZIONI.md, "Notifiche email aggregate per fornitore").
--
-- Nota ordine di applicazione: questo file crea solo la tabella (vuota). La FK reale da
-- articoli_ferramenta.fornitore_id va aggiunta con schema_fornitori_fk_articoli.sql SOLO dopo aver
-- eseguito scripts/migrate-fornitori-to-postgres.mjs, altrimenti l'ALTER fallisce (fornitore_id
-- già valorizzato in articoli_ferramenta punterebbe a righe fornitori non ancora esistenti).
CREATE TABLE IF NOT EXISTS fornitori (
  id            UUID PRIMARY KEY,
  nome          TEXT NOT NULL,
  codice_os1    TEXT NOT NULL DEFAULT '',
  email         TEXT,
  creato_il     TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fornitori_nome ON fornitori(nome);
-- Molti fornitori non hanno un codice OS1 (stringa vuota) — univocità solo dove valorizzato.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fornitori_codice_os1 ON fornitori(codice_os1) WHERE codice_os1 <> '';
