-- Fase 5.1 modulo Gestione Ore avanzato (Previsionale/Capacity Planner): parametri di
-- capacità per reparto, editabili da un admin. giorni_lavorativi_mese NON è una colonna:
-- calcolato al volo da calendario (lun-ven, festivi italiani) per non doverlo risincronizzare
-- ogni anno a mano.

CREATE TABLE IF NOT EXISTS parametri_reparto (
  reparto                    TEXT PRIMARY KEY,   -- uno dei REPARTI_PRODUZIONE (src/lib/types.ts)
  n_persone                  INT NOT NULL DEFAULT 0,
  ore_giorno                 NUMERIC(4,2) NOT NULL DEFAULT 8,
  pct_straordinari_max       NUMERIC(5,2) NOT NULL DEFAULT 0,
  margine_sicurezza_esterni  NUMERIC(5,2) NOT NULL DEFAULT 0,
  tariffa_esterna_eur_h      NUMERIC(8,2),
  ore_giorno_esterno         NUMERIC(4,2),
  aggiornato_il              TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO parametri_reparto (reparto) VALUES
  ('CNC'), ('Falegnameria'), ('Verniciatura'), ('Assemblaggio'), ('Imballaggio'), ('Cablaggi'), ('Sezionatura')
ON CONFLICT (reparto) DO NOTHING;
