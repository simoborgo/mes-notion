-- Immagine JPEG ad alta risoluzione (max ~4500 px di larghezza) della pianta, generata nel browser
-- al caricamento: la visione apre questa invece di scaricare e leggere l'intero PDF. Presente solo
-- per i PDF di una pagina e per le immagini; per gli altri la visione usa il PDF originale.

ALTER TABLE commessa_piante ADD COLUMN IF NOT EXISTS vista BYTEA;
