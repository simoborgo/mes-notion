-- Giorni in cui l'azienda è chiusa (festività non standard, chiusure straordinarie) per
-- Rilevamento Ore. La sola presenza di una riga per una data = azienda chiusa quel giorno:
-- forza "Totale Giornata" a 0h in Vista Oggi e nelle stampe, così un permesso/ferie approvato
-- per quella data non genera più un falso "Straordinario" (capacità netta andava sotto zero
-- quando il totale giornata era 0 ma restavano ore di assenza da sottrarre).
CREATE TABLE IF NOT EXISTS ore_giorni_chiusi (
  data       DATE PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
