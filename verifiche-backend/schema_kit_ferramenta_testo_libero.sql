-- Il Kit Ferramenta ODP richiedeva sempre un articolo reale in anagrafica — troppo rigido per
-- liste che arrivano già scritte (es. minuterie generiche non a codice). articolo_id diventa
-- opzionale; descrizione/codice_os1 vengono denormalizzati sulla riga stessa (non solo via JOIN),
-- così una riga resta leggibile anche senza articolo collegato — stesso principio già in uso per
-- i movimenti_ferramenta (codice_os1 denormalizzato).
ALTER TABLE kit_ferramenta_righe ALTER COLUMN articolo_id DROP NOT NULL;
ALTER TABLE kit_ferramenta_righe ADD COLUMN IF NOT EXISTS descrizione TEXT;
ALTER TABLE kit_ferramenta_righe ADD COLUMN IF NOT EXISTS codice_os1 TEXT;

UPDATE kit_ferramenta_righe r SET
  descrizione = a.descrizione,
  codice_os1 = a.codice_os1
FROM articoli_ferramenta a
WHERE a.id = r.articolo_id AND r.descrizione IS NULL;

ALTER TABLE kit_ferramenta_righe ALTER COLUMN descrizione SET NOT NULL;
