-- Giri esterni di una Scheda: ogni "viaggio" verso un fornitore (RCB, La Lucidatura, QSC, ...) è
-- una riga, così un ciclo Modar → esterno → Modar → esterno → Modar mantiene la sua storia invece
-- di sovrascrivere l'unico set di campi su `schede` (fornitore_id, stato_prod_esterna, tre date).
--
-- Le colonne esterne su `schede` NON vengono rimosse: restano come RIEPILOGO del giro attivo
-- (l'ultimo non "Rientrato", altrimenti l'ultimo), ricalcolato da giriRepository a ogni scrittura
-- di un giro. Filtri, vista "Lavorazioni Esterne", avviso di ritardo, KPI e APS continuano a
-- leggere da lì senza modifiche.
--
-- `stato` replica i valori di schede.stato_prod_esterna (stesso significato, stessa palette badge).

CREATE TABLE IF NOT EXISTS schede_giri (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheda_id               UUID NOT NULL REFERENCES schede(id) ON DELETE CASCADE,
  ordine                  INT NOT NULL,
  fornitore_id            UUID REFERENCES fornitori(id),
  lavorazione             TEXT NOT NULL DEFAULT '',
  stato                   TEXT NOT NULL DEFAULT ''
                             CHECK (stato IN ('', 'Da Ordinare', 'Da Inviare', 'In Lavorazione',
                               'Rientrato', 'In attesa Preventivo', 'Fornitore in attesa materiale')),
  data_uscita             DATE,
  data_rientro_prevista   DATE,
  data_rientro_effettiva  DATE,
  note                    TEXT NOT NULL DEFAULT '',
  creato_il               TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornato_il           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scheda_id, ordine)
);
CREATE INDEX IF NOT EXISTS idx_schede_giri_scheda ON schede_giri(scheda_id, ordine);
CREATE INDEX IF NOT EXISTS idx_schede_giri_fornitore ON schede_giri(fornitore_id);

-- Foto del giro (stesso pattern di scheda_foto / ritiro_foto): file su Drive, cartella MP della
-- Scheda.
CREATE TABLE IF NOT EXISTS schede_giri_foto (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  giro_id       UUID NOT NULL REFERENCES schede_giri(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL,
  ordine        INT NOT NULL DEFAULT 0,
  creato_il     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schede_giri_foto_giro ON schede_giri_foto(giro_id, ordine);

-- Ogni movimento di Ritiri e Consegne appartiene (facoltativamente) a un giro. Se il giro viene
-- eliminato il movimento resta, solo senza collegamento.
ALTER TABLE ritiri ADD COLUMN IF NOT EXISTS giro_id UUID REFERENCES schede_giri(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ritiri_giro ON ritiri(giro_id);

-- Migrazione: ogni scheda che oggi ha dati esterni diventa un giro con ordine 1, copiato dai
-- campi attuali. Idempotente: non tocca le schede che hanno già almeno un giro.
INSERT INTO schede_giri (scheda_id, ordine, fornitore_id, stato, data_uscita, data_rientro_prevista, data_rientro_effettiva)
SELECT s.id, 1, s.fornitore_id, s.stato_prod_esterna, s.data_uscita_materiale, s.data_rientro_prevista, s.data_rientro_effettiva
FROM schede s
WHERE (s.fornitore_id IS NOT NULL OR s.stato_prod_esterna <> '' OR s.data_uscita_materiale IS NOT NULL
       OR s.data_rientro_prevista IS NOT NULL OR s.data_rientro_effettiva IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM schede_giri g WHERE g.scheda_id = s.id);

-- Collega i ritiri già esistenti al giro 1 della loro scheda (per le rilavorazioni il movimento è
-- collegato alla rilavorazione stessa, che è la scheda con i dati esterni).
UPDATE ritiri r SET giro_id = g.id
FROM schede_giri g
WHERE r.giro_id IS NULL AND g.ordine = 1 AND g.scheda_id = COALESCE(r.rilavorazione_id, r.scheda_id);
