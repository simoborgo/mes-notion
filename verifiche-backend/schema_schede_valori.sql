-- Valori economici della Scheda di Produzione (ODP madre). Si salvano solo i due valori canonici:
--  - valore_vendita (€): il costo è sempre il 60% della vendita e si deriva (src/lib/valoriScheda.ts);
--  - ore_manodopera_previste (h): la manodopera in € si deriva con costo_orario_manodopera
--    (parametri_generali, oggi 41 €/h). 4 decimali per non perdere precisione nella conversione € -> h.
-- valore_vendita non è mai incluso nell'oggetto Scheda: lo legge/scrive solo l'admin da
-- /api/schede/[id]/economia. Le ore sono visibili a tutti.
ALTER TABLE schede
  ADD COLUMN IF NOT EXISTS valore_vendita          NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS ore_manodopera_previste NUMERIC(10,4);
