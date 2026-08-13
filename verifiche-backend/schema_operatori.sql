-- Operatori (Personale): anagrafica migrata da Notion (NOTION_DB_OPERATORI). id riusa il Notion
-- page id esistente. matricola replica il valore già assegnato dall'unique_id Notion (es. "DIP-0072")
-- — nessuno storico ore/segmenti da remappare, perché tutte le tabelle Ore già su Postgres
-- (ore_registrate, ore_segmenti_odp, operatori_pin, ecc.) chiavano già per matricola TEXT, mai per
-- id pagina Notion.
CREATE TABLE IF NOT EXISTS operatori (
  id            UUID PRIMARY KEY,
  matricola     TEXT NOT NULL,
  cognome       TEXT NOT NULL,
  nome          TEXT NOT NULL DEFAULT '',
  reparto       TEXT NOT NULL DEFAULT '',
  tipo          TEXT NOT NULL DEFAULT '',
  azienda       TEXT NOT NULL DEFAULT '',
  in_forza      BOOLEAN NOT NULL DEFAULT true,
  creato_il     TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_operatori_matricola ON operatori(matricola);
CREATE INDEX IF NOT EXISTS idx_operatori_in_forza ON operatori(in_forza);
CREATE INDEX IF NOT EXISTS idx_operatori_cognome ON operatori(cognome);

-- Genera le matricole "DIP-NNNN" dei nuovi operatori dopo la migrazione (prima era un unique_id
-- Notion auto-assegnato). Il valore iniziale viene allineato dallo script di migrazione al numero
-- più alto già esistente, per non ripetere matricole già in uso.
CREATE SEQUENCE IF NOT EXISTS operatori_matricola_seq START 1;
