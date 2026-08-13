-- Da applicare SOLO dopo scripts/migrate-fornitori-to-postgres.mjs (tabella fornitori popolata).
-- Prima era "Notion Fornitori page id, nessuna FK" (schema_ferramenta_fase3_postgres.sql) — ora
-- che fornitori esiste su Postgres con lo stesso id, diventa una FK reale. Tutti i valori esistenti
-- sono già id pagina Notion in formato UUID, quindi il cast è sicuro.
ALTER TABLE articoli_ferramenta ALTER COLUMN fornitore_id TYPE UUID USING fornitore_id::uuid;
ALTER TABLE articoli_ferramenta
  DROP CONSTRAINT IF EXISTS fk_articoli_ferramenta_fornitore;
ALTER TABLE articoli_ferramenta
  ADD CONSTRAINT fk_articoli_ferramenta_fornitore FOREIGN KEY (fornitore_id) REFERENCES fornitori(id);
