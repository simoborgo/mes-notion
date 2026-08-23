import type { Commessa, Carico } from "./types";

export type OrdinamentoCommesse = "carichi" | "montaggio";

export interface CommessaConCarichi {
  commessa: Commessa;
  carichi: Carico[];
  caricoDates: Date[];
  primoCarico: Date | null;
  /** Prossimo carico non ancora passato (>= oggi), null se non ce n'è uno. */
  prossimoCarico: Date | null;
  /** Data usata per raggruppare/ordinare le righe, in base all'ordinamento richiesto. */
  dataOrdinamento: Date | null;
}

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

// Join Commesse/Carichi tramite l'ID reale della relation (non testo, a differenza della skill
// che deve ricostruire una chiave testuale perché lavora su due CSV scollegati) — sempre corretto
// by construction. Esclude le commesse Chiuse — stessa logica richiesta da entrambe le skill
// "programma riunione" e "gantt commesse".
//
// Ordinamento — stessa logica del toggle "Carichi/Montaggio" della Dashboard: per "carichi" si
// usa il prossimo carico non ancora passato (un carico preliminare fatto due mesi fa non deve
// ancorare la riga nel passato se il carico vero è stato spostato più avanti), per "montaggio"
// l'inizio montaggio. Le commesse senza carichi futuri restano comunque in elenco, semplicemente
// in fondo (nessuna viene mai esclusa).
export function buildCommesseConCarichi(
  commesse: Commessa[],
  carichi: Carico[],
  ordinamento: OrdinamentoCommesse = "carichi",
): CommessaConCarichi[] {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

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

      const futuro = caricoDates.find((d) => d.getTime() >= oggi.getTime()) ?? null;
      const dataCaricoCommessa = commessa.dataCarico ? toDate(commessa.dataCarico) : null;
      const prossimoCarico =
        futuro ?? (dataCaricoCommessa && dataCaricoCommessa.getTime() >= oggi.getTime() ? dataCaricoCommessa : null);

      const montaggioStart = commessa.inizioMontaggio ? toDate(commessa.inizioMontaggio) : null;

      return {
        commessa,
        carichi: relCarichi,
        caricoDates,
        primoCarico: caricoDates[0] ?? null,
        prossimoCarico,
        dataOrdinamento: ordinamento === "montaggio" ? montaggioStart : prossimoCarico,
      };
    })
    .sort((a, b) => {
      const da = a.dataOrdinamento?.getTime() ?? Infinity;
      const db = b.dataOrdinamento?.getTime() ?? Infinity;
      return da - db;
    });
}
