-- Fase 9: colore_nome rinominato in descrizione_colore, su richiesta dell'utente
-- (2026-08-21). Con il nuovo estratto Excel delle vernici la colonna "Nome Colore" del file
-- sorgente non è più un vero nome di colore ma la descrizione completa dell'articolo (es.
-- "FONDO POLIURETANICO BIANCO - FL-M725-C02", "DILUENTE EPODUR THINNER") — "colore_nome" non
-- descriveva più correttamente il contenuto del campo.
ALTER TABLE vernici RENAME COLUMN colore_nome TO descrizione_colore;
