-- Fase 12: unificazione di Ciclo + Campionatura in un'unica entità "Scheda di Verniciatura",
-- su richiesta dell'utente (2026-08-29) — nella pratica ogni campionatura veniva creata con un
-- ciclo nuovo e specifico (mai riusato tra campionature diverse), quindi la separazione in due
-- tabelle/due UI aggiungeva overhead senza reale beneficio. Il pattern di versioning già
-- esistente su `cicli` (ciclo_padre_id + versione + generaFiglio) è la base su cui estendiamo,
-- assorbendoci dentro i campi oggi su `campionature` (cliente, riferimento colore, barcode,
-- foto), invece di creare una tabella nuova da zero.
--
-- Volume dati in produzione al momento della migrazione: 2 cicli, 1 campionatura, nessun ciclo
-- condiviso da più campionature — la migrazione dati qui sotto (via UPDATE/INSERT da campionature)
-- copre quindi l'intero storico reale.

-- 1) cicli -> schede_verniciatura
ALTER TABLE cicli RENAME TO schede_verniciatura;
ALTER INDEX idx_cicli_padre RENAME TO idx_schede_verniciatura_padre;
ALTER INDEX idx_cicli_stato RENAME TO idx_schede_verniciatura_stato;
ALTER INDEX idx_cicli_attivo RENAME TO idx_schede_verniciatura_attivo;
ALTER TABLE schede_verniciatura RENAME CONSTRAINT cicli_ciclo_padre_id_fkey TO schede_verniciatura_scheda_padre_id_fkey;
ALTER TABLE schede_verniciatura RENAME COLUMN ciclo_padre_id TO scheda_padre_id;

-- 2) cicli_fasi -> schede_verniciatura_fasi (ciclo_id -> scheda_id)
ALTER TABLE cicli_fasi RENAME TO schede_verniciatura_fasi;
ALTER TABLE schede_verniciatura_fasi RENAME COLUMN ciclo_id TO scheda_id;
ALTER TABLE schede_verniciatura_fasi RENAME CONSTRAINT cicli_fasi_ciclo_id_fkey TO schede_verniciatura_fasi_scheda_id_fkey;
ALTER INDEX uq_cicli_fasi_ciclo_ordine RENAME TO uq_schede_verniciatura_fasi_scheda_ordine;

-- 3) cicli_fasi_prodotti -> schede_verniciatura_fasi_prodotti (fase_id invariata)
ALTER TABLE cicli_fasi_prodotti RENAME TO schede_verniciatura_fasi_prodotti;
ALTER TABLE schede_verniciatura_fasi_prodotti RENAME CONSTRAINT cicli_fasi_prodotti_fase_id_fkey TO schede_verniciatura_fasi_prodotti_fase_id_fkey;
ALTER INDEX uq_cicli_fasi_prodotti_fase_vernice_ruolo RENAME TO uq_schede_verniciatura_fasi_prodotti_fase_vernice_ruolo;
ALTER INDEX idx_cicli_fasi_prodotti_vernice RENAME TO idx_schede_verniciatura_fasi_prodotti_vernice;
ALTER INDEX idx_cicli_fasi_prodotti_fase RENAME TO idx_schede_verniciatura_fasi_prodotti_fase;

-- 4) Campi oggi su campionature, spostati sulla scheda unificata.
--    cliente_id è ora una FK vera verso clienti_verniciatura (campionature.cliente era testo
--    validato solo lato app).
ALTER TABLE schede_verniciatura
  ADD COLUMN IF NOT EXISTS cliente_id INT REFERENCES clienti_verniciatura(id),
  ADD COLUMN IF NOT EXISTS codice_campione_materialista TEXT,
  ADD COLUMN IF NOT EXISTS codice_pubblico TEXT,
  ADD COLUMN IF NOT EXISTS data_prova DATE NOT NULL DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_schede_verniciatura_cliente ON schede_verniciatura(cliente_id);
CREATE INDEX IF NOT EXISTS idx_schede_verniciatura_codice_pubblico ON schede_verniciatura(codice_pubblico);

-- validato_da_campionatura_id non serve più: l'esito è ora sulla stessa riga (validato_at basta).
ALTER TABLE schede_verniciatura DROP CONSTRAINT IF EXISTS fk_cicli_validato_da_campionatura;
ALTER TABLE schede_verniciatura DROP COLUMN IF EXISTS validato_da_campionatura_id;

-- 5) campionature_foto -> schede_verniciatura_foto. La colonna rinominata continua per ora a
--    contenere l'id della campionatura (non ancora quello della scheda) finché il backfill al
--    passo 7 non la rimappa: il rename da solo non basta perché campionatura.id != ciclo.id.
ALTER TABLE campionature_foto RENAME TO schede_verniciatura_foto;
ALTER TABLE schede_verniciatura_foto RENAME COLUMN campionatura_id TO scheda_id;
ALTER INDEX uq_campionature_foto_campionatura_file RENAME TO uq_schede_verniciatura_foto_scheda_file;

-- 6) Backfill dei campi campionatura sulla scheda collegata (dati reali: 1 campionatura). Il
--    vecchio CHECK va tolto PRIMA di questo UPDATE (accetta solo 'bozza'/'validato', mentre qui
--    scriviamo già i valori del nuovo enum unificato, es. 'in_revisione'); il nuovo CHECK va
--    aggiunto DOPO (passo 8), quando tutte le righe rispettano già i nuovi valori ammessi.
ALTER TABLE schede_verniciatura DROP CONSTRAINT IF EXISTS cicli_stato_check;

UPDATE schede_verniciatura sv
SET
  cliente_id = cv.id,
  codice_campione_materialista = c.codice_campione_materialista,
  codice_pubblico = c.codice_pubblico,
  data_prova = c.data_campionatura,
  stato = c.esito
FROM campionature c
LEFT JOIN clienti_verniciatura cv ON LOWER(cv.nome) = LOWER(c.cliente)
WHERE sv.id = c.ciclo_id;

-- 7) Backfill delle foto: scheda_id oggi contiene ancora l'id della campionatura, va rimappato
--    all'id della scheda (= vecchio ciclo_id), poi la FK va ripuntata su schede_verniciatura.
UPDATE schede_verniciatura_foto sf
SET scheda_id = c.ciclo_id
FROM campionature c
WHERE sf.scheda_id = c.id;

ALTER TABLE schede_verniciatura_foto DROP CONSTRAINT IF EXISTS campionature_foto_campionatura_id_fkey;
ALTER TABLE schede_verniciatura_foto
  ADD CONSTRAINT schede_verniciatura_foto_scheda_id_fkey
  FOREIGN KEY (scheda_id) REFERENCES schede_verniciatura(id) ON DELETE CASCADE;

-- Fallback: schede validate manualmente senza mai passare da una campionatura (stato 'validato'
-- non toccato dal backfill sopra, che copre solo le righe con una campionatura collegata) sono
-- comunque equivalenti a 'approvato' nel nuovo enum unificato.
UPDATE schede_verniciatura SET stato = 'approvato' WHERE stato = 'validato';

-- 8) Stato unificato: bozza -> in_revisione -> approvato | rifiutato (fonde StatoCiclo ed
--    EsitoCampionatura; "approvato" è l'ex "validato"). Non più monotono verso un solo valore
--    finale: può terminare in "rifiutato", da cui si genera una nuova versione (che riparte da
--    bozza) invece di sbloccare la stessa riga.
ALTER TABLE schede_verniciatura
  ADD CONSTRAINT schede_verniciatura_stato_check
  CHECK (stato IN ('bozza', 'in_revisione', 'approvato', 'rifiutato'));

-- 9) campionature non serve più: tutto il suo contenuto vive ora su schede_verniciatura.
DROP TABLE IF EXISTS campionature;
