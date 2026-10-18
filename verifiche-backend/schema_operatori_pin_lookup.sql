-- Accesso al tablet con il solo PIN (scansione QR della scheda → PIN → via, senza scegliere il nome).
-- pin_hash usa un salt casuale per riga, quindi non permette di cercare "chi ha il PIN 1234" né di
-- imporre l'unicità: pin_lookup è un'impronta deterministica (HMAC con segreto del server, mai il
-- PIN in chiaro) con indice univoco. Additiva e nullable: gli operatori esistenti la ottengono al
-- prossimo login con nome+PIN o quando l'admin reimposta il PIN; nel frattempo continuano a
-- funzionare con nome+PIN come prima.
ALTER TABLE operatori_pin ADD COLUMN IF NOT EXISTS pin_lookup TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS operatori_pin_lookup_uniq ON operatori_pin (pin_lookup) WHERE pin_lookup IS NOT NULL;
