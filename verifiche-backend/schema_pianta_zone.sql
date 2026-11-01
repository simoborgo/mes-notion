-- Zone rettangolari cliccabili sulla pianta: l'ingombro di un arredo, agganciato a un'Area della
-- commessa (e quindi ai suoi ODP tramite schede.area_id). Coordinate normalizzate 0–1 sulla
-- pagina, come i segni grafici. area_id nullo = zona non ancora agganciata.

CREATE TABLE IF NOT EXISTS pianta_zone (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pianta_id   UUID NOT NULL REFERENCES commessa_piante(id) ON DELETE CASCADE,
  pagina      INTEGER NOT NULL DEFAULT 1,
  x           DOUBLE PRECISION NOT NULL,
  y           DOUBLE PRECISION NOT NULL,
  w           DOUBLE PRECISION NOT NULL,
  h           DOUBLE PRECISION NOT NULL,
  area_id     UUID REFERENCES aree(id) ON DELETE SET NULL,
  creato_da   TEXT NOT NULL DEFAULT '',
  creato_il   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pianta_zone_pianta ON pianta_zone(pianta_id);
CREATE INDEX IF NOT EXISTS idx_pianta_zone_area ON pianta_zone(area_id);
