-- Rete di sicurezza a livello DB: un intervallo pianificato invertito (data_fine precedente a
-- data_inizio) non deve mai poter essere scritto, da nessun punto del codice — oggi presente o
-- futuro. Senza questo vincolo, un bug in un punto che scrive queste due colonne corromperebbe
-- silenziosamente il dato, lasciando solo un cerotto lato UI (dateEffettive in GanttAps.tsx) a
-- nasconderlo in visualizzazione senza risolverlo alla radice. NULL è sempre ammesso su
-- entrambi i lati (fase non ancora pianificata, o esclusa).
ALTER TABLE schede_fasi DROP CONSTRAINT IF EXISTS chk_schede_fasi_date_coerenti;
ALTER TABLE schede_fasi ADD CONSTRAINT chk_schede_fasi_date_coerenti
  CHECK (data_inizio_pianificata IS NULL OR data_fine_pianificata IS NULL OR data_fine_pianificata >= data_inizio_pianificata);
