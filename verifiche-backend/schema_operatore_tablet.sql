-- PIN individuale per operatore (separato da Notion: dato di autenticazione, non
-- dato anagrafico/di business — tenuto fuori da un sistema visto/editabile da più persone).
CREATE TABLE IF NOT EXISTS operatori_pin (
  matricola   TEXT PRIMARY KEY,
  pin_hash    TEXT NOT NULL,     -- "salt:hash" (scrypt, Node crypto)
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Segmenti di lavoro "sto lavorando su ODP X dalle HH:MM": un solo segmento aperto
-- per operatore alla volta. Alla chiusura, la durata calcolata confluisce (sommata,
-- non sostituita) in ore_registrate — ore_segmenti_odp resta la traccia/audit dei passaggi.
CREATE TABLE IF NOT EXISTS ore_segmenti_odp (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matricola      TEXT NOT NULL,
  data           DATE NOT NULL,
  odp            TEXT NOT NULL,
  rif            BOOLEAN NOT NULL DEFAULT false,
  iniziato_alle  TIMESTAMPTZ NOT NULL DEFAULT now(),
  chiuso_alle    TIMESTAMPTZ,
  ore            NUMERIC(4,2),                   -- valorizzata alla chiusura
  anomalo        BOOLEAN NOT NULL DEFAULT false,  -- durata oltre soglia (segmento dimenticato aperto) — da rivedere
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ore_segmenti_aperto ON ore_segmenti_odp(matricola) WHERE chiuso_alle IS NULL;
CREATE INDEX IF NOT EXISTS idx_ore_segmenti_data ON ore_segmenti_odp(data);
