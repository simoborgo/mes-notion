-- Fallback al modulo Offerte/Previsionale per quando non si inseriscono le righe articolo
-- (troppo lavoro caricare ogni singolo articolo, deciso con l'utente 2026-08-07): percentuali
-- di ripartizione manuale tra reparti delle ore stimate da valore_commessa/costo_orario_manodopera.
-- Usate da calcolaPrevisionale SOLO quando l'offerta non ha righe in offerte_righe (le righe,
-- quando ci sono, hanno sempre precedenza — dato più preciso).
--
-- A differenza di offerte_righe (bloccata dopo la conferma, rappresenta l'ordine definitivo),
-- questa tabella resta modificabile anche a offerta Confermata: è solo un input per la
-- pianificazione interna della capacità, non fa parte dell'impegno commerciale.
--
-- Salvataggio "a insieme completo": ogni PUT sostituisce tutte le righe dell'offerta
-- (DELETE + INSERT in transazione), mai un update riga per riga.
CREATE TABLE IF NOT EXISTS offerte_stima_reparto (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offerta_id    UUID NOT NULL REFERENCES offerte(id) ON DELETE CASCADE,
  reparto       TEXT NOT NULL,
  percentuale   NUMERIC(5,2) NOT NULL CHECK (percentuale >= 0 AND percentuale <= 100),
  aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (offerta_id, reparto)
);
CREATE INDEX IF NOT EXISTS idx_offerte_stima_reparto_offerta ON offerte_stima_reparto(offerta_id);
