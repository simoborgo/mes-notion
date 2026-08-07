-- Impostazioni aziendali globali, un'unica riga (pattern singleton, riusabile per futuri
-- parametri unici non legati a un reparto). Prima voce: costo orario medio della manodopera
-- interna, usato dal Previsionale per stimare le ore di un'offerta senza righe articolo
-- (ore = valore_commessa / costo_orario_manodopera). Sempre il valore corrente, non
-- storicizzato per offerta (deciso con l'utente 2026-08-07).
CREATE TABLE IF NOT EXISTS parametri_generali (
  id                        SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  costo_orario_manodopera   NUMERIC(8,2) NOT NULL DEFAULT 0,
  aggiornato_il             TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO parametri_generali (id) VALUES (1) ON CONFLICT DO NOTHING;
