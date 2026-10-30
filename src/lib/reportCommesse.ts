import type { Commessa, Carico } from "./types";

export type OrdinamentoCommesse = "carichi" | "montaggio" | "produzione";

// Periodo opzionale scelto in Dashboard (mesi "Da"/"A"): primo giorno del mese Da e ultimo del mese A.
export interface PeriodoCommesse { da: Date | null; a: Date | null; }

export interface ParametriStampa { ordinamento: OrdinamentoCommesse; periodo: PeriodoCommesse; }

function parteMese(v: string | null, fine: boolean): Date | null {
  if (!v || !/^\d{4}-\d{2}$/.test(v)) return null;
  const [y, m] = v.split("-").map(Number);
  return fine ? new Date(y, m, 0) : new Date(y, m - 1, 1);
}

// Stessi parametri della Dashboard da cui si stampa: toggle di ordinamento e mesi Da/A.
export function leggiParametriStampa(sp: URLSearchParams): ParametriStampa {
  const o = sp.get("ordinamento");
  const ordinamento: OrdinamentoCommesse = o === "montaggio" || o === "produzione" ? o : "carichi";
  return { ordinamento, periodo: { da: parteMese(sp.get("da"), false), a: parteMese(sp.get("a"), true) } };
}

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

/** Inizio/fine produzione e montaggio come date, per gli export. */
export function intervalliCommessa(r: CommessaConCarichi): { produzione: [Date, Date] | null; montaggio: [Date, Date] | null } {
  const coppia = (s: string | null, e: string | null): [Date, Date] | null => {
    const inizio = s ?? e, fine = e ?? s;
    return inizio && fine ? [toDate(inizio), toDate(fine)] : null;
  };
  return {
    produzione: coppia(r.commessa.inizioProduzione, r.commessa.fineProduzione),
    montaggio: coppia(r.commessa.inizioMontaggio, r.commessa.fineMontaggio),
  };
}

// Con un periodo scelto restano solo le commesse con almeno una data (carico, produzione,
// montaggio) dentro o a cavallo del periodo — stessa regola del Gantt in Dashboard.
export function filtraPerPeriodo(righe: CommessaConCarichi[], periodo: PeriodoCommesse): CommessaConCarichi[] {
  if (!periodo.da && !periodo.a) return righe;
  return righe.filter((r) => {
    const { produzione, montaggio } = intervalliCommessa(r);
    const intervalli: [Date, Date][] = r.caricoDates.map((d): [Date, Date] => [d, d]);
    if (produzione) intervalli.push(produzione);
    if (montaggio) intervalli.push(montaggio);
    return intervalli.some(([s, e]) => (!periodo.a || s <= periodo.a) && (!periodo.da || e >= periodo.da));
  });
}

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

// Join Commesse/Carichi tramite l'ID reale della relation (non testo, a differenza della skill
// che deve ricostruire una chiave testuale perché lavora su due CSV scollegati) — sempre corretto
// by construction. Esclude le commesse Chiuse — stessa logica richiesta da entrambe le skill
// "programma riunione" e "gantt commesse".
//
// Ordinamento — stessa logica del toggle "Carichi/Montaggio/Produzione" della Dashboard: per "carichi" si
// usa il prossimo carico non ancora passato (un carico preliminare fatto due mesi fa non deve
// ancorare la riga nel passato se il carico vero è stato spostato più avanti), per "montaggio"
// l'inizio montaggio, per "produzione" l'inizio produzione. Le commesse senza carichi futuri restano comunque in elenco, semplicemente
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
      const produzioneStart = commessa.inizioProduzione ? toDate(commessa.inizioProduzione) : null;

      return {
        commessa,
        carichi: relCarichi,
        caricoDates,
        primoCarico: caricoDates[0] ?? null,
        prossimoCarico,
        dataOrdinamento: ordinamento === "montaggio" ? montaggioStart : ordinamento === "produzione" ? produzioneStart : prossimoCarico,
      };
    })
    .sort((a, b) => {
      const da = a.dataOrdinamento?.getTime() ?? Infinity;
      const db = b.dataOrdinamento?.getTime() ?? Infinity;
      return da - db;
    });
}
