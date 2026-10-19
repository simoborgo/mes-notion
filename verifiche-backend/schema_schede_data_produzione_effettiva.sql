-- Data di produzione effettiva: giorno in cui la scheda/ODP è passata a "Completato" (fine ciclo).
-- È il valore su cui si calcolerà il KPI di Lead Time (vs. data_produzione_prevista, che resta la
-- pianificazione). Valorizzata dal repository al passaggio di stato, modificabile a mano dal modal
-- di modifica, azzerata se la scheda esce da "Completato" (riapertura/rilavorazione).
-- Additiva e nullable.
ALTER TABLE schede ADD COLUMN IF NOT EXISTS data_produzione_effettiva DATE;

-- Backfill una tantum dalle schede già Completate, ricavando la data dall'audit_log: la PRIMA voce
-- di UPDATE scheda che contiene "Completato" (il modal registra l'intero form a ogni salvataggio,
-- quindi l'ultima voce sarebbe solo l'ultima modifica successiva). Le schede senza traccia in audit
-- (l'audit parte il 2026-07-29, e alcuni flussi non loggavano) restano NULL: nessuna data inventata.
UPDATE schede s
SET data_produzione_effettiva = a.giorno
FROM (
  SELECT id_risorsa, (min(creato_il) AT TIME ZONE 'Europe/Rome')::date AS giorno
  FROM audit_log
  WHERE azione = 'UPDATE scheda' AND modifiche LIKE '%"Completato"%'
  GROUP BY id_risorsa
) a
WHERE a.id_risorsa = s.id::text AND s.stato = 'Completato' AND s.data_produzione_effettiva IS NULL;
