import type { Commessa, Carico } from "./types";

export interface CommessaConCarichi {
  commessa: Commessa;
  carichi: Carico[];
  caricoDates: Date[];
  primoCarico: Date | null;
}

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

// Join Commesse/Carichi tramite l'ID reale della relation (non testo, a differenza della skill
// che deve ricostruire una chiave testuale perché lavora su due CSV scollegati) — sempre corretto
// by construction. Esclude le commesse Chiuse e ordina per data del primo carico collegato
// (le commesse senza alcun carico finiscono in fondo) — stessa logica richiesta da entrambe le
// skill "programma riunione" e "gantt commesse".
export function buildCommesseConCarichi(commesse: Commessa[], carichi: Carico[]): CommessaConCarichi[] {
  const carichiByCommessa = new Map<string, Carico[]>();
  for (const c of carichi) {
    if (!c.commessaId) continue;
    const arr = carichiByCommessa.get(c.commessaId) ?? [];
    arr.push(c);
    carichiByCommessa.set(c.commessaId, arr);
  }

  return commesse
    .filter((c) => c.stato !== "Chiusa")
    .map((commessa): CommessaConCarichi => {
      const relCarichi = carichiByCommessa.get(commessa.id) ?? [];
      const caricoDates = relCarichi
        .map((c) => c.dataCarico)
        .filter((d): d is string => !!d)
        .map(toDate)
        .sort((a, b) => a.getTime() - b.getTime());
      return {
        commessa,
        carichi: relCarichi,
        caricoDates,
        primoCarico: caricoDates[0] ?? null,
      };
    })
    .sort((a, b) => {
      const da = a.primoCarico?.getTime() ?? Infinity;
      const db = b.primoCarico?.getTime() ?? Infinity;
      return da - db;
    });
}
