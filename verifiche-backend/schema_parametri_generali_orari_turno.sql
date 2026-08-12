-- Orari nominali di turno, configurabili da Admin (prima erano hardcoded in
-- src/app/api/webhooks/ore-chiusura-automatica/route.ts). Il sabato non ha pausa pranzo:
-- il turno finisce a mezzogiorno, prima di pranzo (deciso con l'utente 2026-08-11).
ALTER TABLE parametri_generali
  ADD COLUMN IF NOT EXISTS turno_feriale_inizio        TIME NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS turno_feriale_fine           TIME NOT NULL DEFAULT '18:30',
  ADD COLUMN IF NOT EXISTS turno_feriale_pausa_inizio   TIME NOT NULL DEFAULT '12:30',
  ADD COLUMN IF NOT EXISTS turno_feriale_pausa_fine     TIME NOT NULL DEFAULT '13:30',
  ADD COLUMN IF NOT EXISTS turno_sabato_inizio          TIME NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS turno_sabato_fine             TIME NOT NULL DEFAULT '12:00';
