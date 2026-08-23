-- Fase 1 del modulo APS (Advanced Planning & Scheduling): struttura pipeline. Introduce
-- Reparti come entità vera (sostituisce, per lo scheduling APS, il semplice elenco
-- REPARTI_PRODUZIONE di src/lib/types.ts — quell'array resta invariato, usato da Ore/Schede)
-- e Pattern_Ciclo/Pattern_Ciclo_Fasi per descrivere la sequenza di reparti che un articolo
-- attraversa. Non tocca ancora `schede` — la generazione delle fasi per ODP (schede_fasi)
-- è Fase 2, non questa.

CREATE TABLE IF NOT EXISTS reparti (
  id                   TEXT PRIMARY KEY,   -- slug stabile, es. 'cnc', 'tranciatura_pressa'
  nome                 TEXT NOT NULL,
  tipo_capacita        TEXT NOT NULL CHECK (tipo_capacita IN ('corsie','monte_ore')),
  capacita_sett        NUMERIC(8,2),       -- ore/settimana, NULL se tbd
  n_risorse_parallele  INT,                -- solo tipo_capacita = 'corsie'
  wip_max              INT,                -- solo tipo_capacita = 'monte_ore' (CONWIP)
  tamburo              BOOLEAN NOT NULL DEFAULT false,
  ordine_pipeline      INT NOT NULL,
  tbd                  BOOLEAN NOT NULL DEFAULT false,
  aggiornato_il        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dati iniziali: capacità reali dove confermate, placeholder (tbd = true) dove l'organico
-- non è ancora definitivo. Cablaggi non è nella pipeline descritta per l'APS (nessuna
-- posizione nota tra gli altri reparti): resta in elenco, editabile, senza Pattern_Ciclo_Fasi
-- che lo referenzi finché non si sa dove inserirlo.
INSERT INTO reparti (id, nome, tipo_capacita, capacita_sett, n_risorse_parallele, wip_max, tamburo, ordine_pipeline, tbd) VALUES
  ('ufficio_tecnico',    'Distinte e Sviluppo',      'monte_ore', NULL, NULL, NULL, false, 10, true),
  ('sezionatura',        'Sezionatura',              'corsie',     95,     2, NULL, false, 20, false),
  ('tranciatura_pressa', 'Tranciatura-Pressa',       'corsie',     95,     1, NULL, false, 30, false),
  ('cnc',                'CNC',                      'corsie',    180,     2, NULL, true,  40, false),
  ('falegnameria',       'Falegnameria',             'monte_ore', 1615, NULL,   15, false, 50, false),
  ('levigatura',         'Levigatura',               'monte_ore',  95, NULL,    2, false, 60, false),
  ('verniciatura',       'Verniciatura',             'corsie',    150,     2, NULL, true,  70, false),
  ('assemblaggio',       'Assemblaggio',             'monte_ore', NULL, NULL, NULL, false, 80, true),
  ('imballaggio',        'Imballaggio & Logistica',  'monte_ore', NULL, NULL, NULL, false, 90, true),
  ('cablaggi',           'Cablaggi',                 'monte_ore', NULL, NULL, NULL, false, 85, true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS pattern_ciclo (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome    TEXT NOT NULL,
  attivo  BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS pattern_ciclo_fasi (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id              UUID NOT NULL REFERENCES pattern_ciclo(id) ON DELETE CASCADE,
  reparto_id              TEXT NOT NULL REFERENCES reparti(id),
  ordine                  INT NOT NULL,
  sotto_fase              TEXT,             -- es. "Distinta Base", "Tranciatura", "Pressa"
  condizionale            BOOLEAN NOT NULL DEFAULT false,
  condizione              TEXT,             -- es. 'programma_cnc_non_esistente' — valutata in Fase 2
  parallellizzabile       BOOLEAN NOT NULL DEFAULT false,
  tempo_attrezzaggio_ore  NUMERIC(6,2),
  UNIQUE (pattern_id, ordine)
);

-- Risolve "Articoli.pattern_id ereditato da categoria" (spec APS sez. 2): mapping esplicito
-- categoria -> pattern di default, non esisteva alcun meccanismo di ereditarietà nel repo.
CREATE TABLE IF NOT EXISTS categoria_pattern_default (
  categoria   TEXT PRIMARY KEY,   -- valore di articoli.categoria
  pattern_id  UUID NOT NULL REFERENCES pattern_ciclo(id)
);

ALTER TABLE articoli ADD COLUMN IF NOT EXISTS pattern_id UUID REFERENCES pattern_ciclo(id);
-- Booleano semplice (non una data): basta a sapere se saltare "Sviluppo CNC" per gli ODP
-- successivi con lo stesso codice articolo. Si valorizza a true la prima volta che l'articolo
-- passa per quella fase (logica di Fase 2).
ALTER TABLE articoli ADD COLUMN IF NOT EXISTS programma_cnc_disponibile BOOLEAN NOT NULL DEFAULT false;

-- Seed di due pattern minimi, sufficienti a coprire la biforcazione con/senza fresatura CNC
-- vista nel prototipo di riferimento (mes-aps-simulatore.jsx). Altri pattern (5-10 attesi per
-- coprire la varietà reale del catalogo) si aggiungono via SQL quando definiti con l'utente.
DO $$
DECLARE
  pattern_a UUID;
  pattern_b UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pattern_ciclo WHERE nome = 'Legno con fresatura CNC') THEN
    INSERT INTO pattern_ciclo (nome) VALUES ('Legno con fresatura CNC') RETURNING id INTO pattern_a;
    INSERT INTO pattern_ciclo_fasi (pattern_id, reparto_id, ordine, sotto_fase, condizionale, condizione) VALUES
      (pattern_a, 'ufficio_tecnico', 10, 'Distinta Base', false, NULL),
      (pattern_a, 'ufficio_tecnico', 20, 'Sviluppo CNC', true, 'programma_cnc_non_esistente'),
      (pattern_a, 'sezionatura', 30, NULL, false, NULL),
      (pattern_a, 'tranciatura_pressa', 40, 'Tranciatura', false, NULL),
      (pattern_a, 'tranciatura_pressa', 50, 'Pressa', false, NULL),
      (pattern_a, 'cnc', 60, NULL, false, NULL),
      (pattern_a, 'falegnameria', 70, NULL, false, NULL),
      (pattern_a, 'levigatura', 80, NULL, false, NULL),
      (pattern_a, 'verniciatura', 90, NULL, false, NULL),
      (pattern_a, 'assemblaggio', 100, NULL, false, NULL),
      (pattern_a, 'imballaggio', 110, NULL, false, NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pattern_ciclo WHERE nome = 'Legno senza fresatura') THEN
    INSERT INTO pattern_ciclo (nome) VALUES ('Legno senza fresatura') RETURNING id INTO pattern_b;
    INSERT INTO pattern_ciclo_fasi (pattern_id, reparto_id, ordine, sotto_fase, condizionale, condizione) VALUES
      (pattern_b, 'ufficio_tecnico', 10, 'Distinta Base', false, NULL),
      (pattern_b, 'sezionatura', 30, NULL, false, NULL),
      (pattern_b, 'tranciatura_pressa', 40, 'Tranciatura', false, NULL),
      (pattern_b, 'tranciatura_pressa', 50, 'Pressa', false, NULL),
      (pattern_b, 'falegnameria', 70, NULL, false, NULL),
      (pattern_b, 'levigatura', 80, NULL, false, NULL),
      (pattern_b, 'verniciatura', 90, NULL, false, NULL),
      (pattern_b, 'assemblaggio', 100, NULL, false, NULL),
      (pattern_b, 'imballaggio', 110, NULL, false, NULL);
  END IF;
END $$;
