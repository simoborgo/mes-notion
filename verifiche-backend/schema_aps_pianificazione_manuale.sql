-- Fase 9 — pianificazione manuale (drag&drop): una fase spostata a mano sul Gantt resta ferma
-- alle date scelte finché non viene sbloccata esplicitamente, invece di essere riassorbita dal
-- prossimo ricalcolo automatico. Soft: mai un dato separato dalle date "vere", solo un flag.
ALTER TABLE schede_fasi ADD COLUMN IF NOT EXISTS pianificazione_manuale BOOLEAN NOT NULL DEFAULT false;
