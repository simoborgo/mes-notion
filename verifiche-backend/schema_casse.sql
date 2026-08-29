-- Packing List: casse da preparare/caricare per Commessa, con le Schede assegnate dentro.
-- Chiude il ciclo Materiale Pronto -> Verificato (automatico da Verifica Spedizione) ->
-- Completato (bottone "Completato e messo in cassa" in Spedizioni Merci) -> organizzazione
-- fisica in casse (qui). Stesso pattern di schema_carichi.sql (entità testata + giunzione N:N),
-- ma id UUID nativo: una Cassa è un concetto nuovo, non riusa un Notion page id.
--
-- Una Scheda può stare su più casse (deciso con l'utente 2026-08-29, es. un arredo smontato in
-- più casse) — cassa_schede è quindi una vera giunzione N:N, non un semplice cassa_id su schede.

CREATE TABLE IF NOT EXISTS casse (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commessa_id   UUID NOT NULL REFERENCES commesse(id),
  numero        INT NOT NULL,             -- progressivo per commessa (Cassa 1, Cassa 2...)
  descrizione   TEXT NOT NULL DEFAULT '', -- libero, es. "Camera da letto"
  stato         TEXT NOT NULL DEFAULT 'Da preparare'
                  CHECK (stato IN ('Da preparare', 'Pronta', 'Caricata')),
  note          TEXT NOT NULL DEFAULT '',
  creato_il     TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (commessa_id, numero)
);

CREATE TABLE IF NOT EXISTS cassa_schede (
  cassa_id   UUID NOT NULL REFERENCES casse(id) ON DELETE CASCADE,
  scheda_id  UUID NOT NULL REFERENCES schede(id),
  note       TEXT NOT NULL DEFAULT '', -- es. "solo ante" quando una Scheda è split su più casse
  creato_il  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cassa_id, scheda_id)
);

CREATE INDEX IF NOT EXISTS idx_casse_commessa ON casse(commessa_id);
CREATE INDEX IF NOT EXISTS idx_cassa_schede_scheda ON cassa_schede(scheda_id);
