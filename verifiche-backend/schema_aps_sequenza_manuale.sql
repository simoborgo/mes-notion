-- Fase 9b — sequenziamento manuale per macchina (Vista CNC "Programmazione"): a differenza di
-- pianificazione_manuale (che congela le date scelte a mano), qui l'ufficio programmazione
-- sceglie solo corsia + posizione in coda per quella corsia — le date restano sempre calcolate
-- dal motore (pianificaCorsie, apsSchedulerRepository.ts) dalle ore stimate, mai congelate.
-- NULL = fase sotto controllo completamente automatico (comportamento invariato per ogni reparto
-- che non usa questa vista — oggi solo CNC). Non univoco di per sé: l'ordine viene rinumerato
-- 1..N ad ogni riordino (vedi impostaCodaManualeCnc, schedeFasiRepository.ts), mai calcolato
-- per differenza/inserimento a metà.
ALTER TABLE schede_fasi ADD COLUMN IF NOT EXISTS sequenza_manuale INT;
