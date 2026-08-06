-- Aggiunge l'ambito "inventariato" (solo gli articoli con flag inventariato=true, dal reimport
-- anagrafica OS1 2026-08-06) alle scelte disponibili per aprire una sessione di inventario.
ALTER TABLE inventari_ferramenta DROP CONSTRAINT inventari_ferramenta_ambito_check;
ALTER TABLE inventari_ferramenta ADD CONSTRAINT inventari_ferramenta_ambito_check
  CHECK (ambito IN ('tutto', 'kanban', 'ubicazione', 'sotto_scorta', 'inventariato'));
