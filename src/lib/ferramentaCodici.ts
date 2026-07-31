// Normalizza un codice fornitore per il confronto: rimuove separatori/spazi e zeri iniziali.
// Necessario perché tracciati fornitore e ricerche manuali non usano sempre lo stesso formato
// dell'anagrafica (es. "0653700400" vs "653700400", o codici con spazio interno "071566 07").
// Nessuna dipendenza da server (pg/notion): utilizzabile sia lato server sia in componenti client.
export function normalizzaCodiceFornitore(codice: string): string {
  return codice.replace(/[^a-z0-9]/gi, "").replace(/^0+/, "").toLowerCase();
}
