-- Corregge un disallineamento: REPARTI_PRODUZIONE (src/lib/types.ts) è stato esteso il 2026-08-23
-- con 3 reparti APS (Distinte e Sviluppo, Pressa, Levigatura), ma nessuna migrazione ha mai
-- inserito le righe corrispondenti in parametri_reparto — restavano seedati solo i 7 storici
-- (vedi schema_parametri_reparto.sql). Effetto pratico: i 3 reparti non comparivano nella tabella
-- Parametri Reparto (getParametriReparto() legge solo le righe esistenti) e capacityPlannerRepository
-- li trattava come "0 persone" senza modo di correggerlo da UI (sempre in sforo nel Previsionale).
--
-- Stessi default della riga PRIMARY KEY, coerenti con schema_parametri_reparto.sql — l'admin
-- imposterà i valori reali da Amministrazione ▾ → Previsionale → Parametri.
INSERT INTO parametri_reparto (reparto) VALUES
  ('Distinte e Sviluppo'), ('Pressa'), ('Levigatura')
ON CONFLICT (reparto) DO NOTHING;
