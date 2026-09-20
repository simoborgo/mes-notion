-- Fase 10 — modello a ore/giorno per i reparti a corsie (oggi solo CNC): ogni corsia ha ore utili
-- per giorno dal turno reale (Impostazioni → Orari Turno) e i lavori consumano quelle ore in
-- sequenza, invece di occupare una giornata intera ciascuno (pianificaCorsieOre,
-- apsSchedulerRepository.ts). `modello_ore` è l'interruttore per reparto: resta false finché non lo
-- si attiva esplicitamente dopo aver rivisto l'anteprima (dryRun) — additivo e inerte da solo.
ALTER TABLE reparti ADD COLUMN IF NOT EXISTS modello_ore BOOLEAN NOT NULL DEFAULT false;

-- Ore allocate per fase e giorno. data_inizio_pianificata/data_fine_pianificata su schede_fasi
-- restano e sono derivate (min/max dei giorni qui), così Gantt, a_rischio e SchedaFasiApsTab
-- non cambiano. ordine_giorno = ordine dei lavori nella stessa corsia e giorno.
CREATE TABLE IF NOT EXISTS schede_fasi_allocazioni (
  fase_id       UUID NOT NULL REFERENCES schede_fasi(id) ON DELETE CASCADE,
  giorno        DATE NOT NULL,
  corsia        INT NOT NULL,
  ore           NUMERIC(5,2) NOT NULL CHECK (ore > 0),
  ordine_giorno INT NOT NULL DEFAULT 1,
  PRIMARY KEY (fase_id, giorno)
);
CREATE INDEX IF NOT EXISTS idx_fasi_allocazioni_giorno_corsia ON schede_fasi_allocazioni(giorno, corsia);
