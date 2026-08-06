// Normalizza un codice fornitore per il confronto: rimuove separatori/spazi e zeri iniziali.
// Necessario perché tracciati fornitore e ricerche manuali non usano sempre lo stesso formato
// dell'anagrafica (es. "0653700400" vs "653700400", o codici con spazio interno "071566 07").
// Nessuna dipendenza da server (pg/notion): utilizzabile sia lato server sia in componenti client.
export function normalizzaCodiceFornitore(codice: string): string {
  return codice.replace(/[^a-z0-9]/gi, "").replace(/^0+/, "").toLowerCase();
}

// Nome fornitore da mostrare: preferisce fornitoreNome (risolto da Notion Fornitori, valorizzato
// solo per gli articoli creati manualmente da mes-notion) e ripiega su fornitoreNomeOs1 (Ragione
// Sociale del tracciato OS1, l'unica fonte disponibile per gli articoli importati da file — es.
// il reimport anagrafica 2026-08-06, dove fornitoreNome resta vuoto per tutti gli 8358 articoli).
export function nomeFornitore(a: { fornitoreNome: string; fornitoreNomeOs1: string }): string {
  return a.fornitoreNome || a.fornitoreNomeOs1;
}
