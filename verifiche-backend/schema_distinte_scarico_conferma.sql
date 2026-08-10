-- Aggiunge il passaggio "conferma e notifica magazziniere" già esistente per il Kit Ferramenta
-- ODP (kit/[schedaId]/conferma) anche alle Distinte di Scarico — mancava del tutto: la distinta
-- era pensata solo per essere scoperta manualmente sfogliando la lista, mai notificata a chi deve
-- prepararla. confermata_il è indipendente da stato/chiuso: si può chiudere (scaricare) anche
-- senza aver mai confermato/notificato, e viceversa la conferma non blocca la chiusura.
ALTER TABLE distinte_scarico ADD COLUMN IF NOT EXISTS confermata_il TIMESTAMPTZ;
