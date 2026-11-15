import type { Scheda } from "./types";

// Completezza del materiale di una scheda padre (un arredo) vista dalla Logistica: quante
// sottoschede sono in sede e quante mancano perché ancora presso un fornitore (o in partenza).
// Solo indicatore calcolato: non è uno stato e non tocca "Materiale Pronto" (invio al magazzino
// spedizioni dopo il controllo qualità). Nessun dato nuovo: usa stato e campi esterni delle figlie,
// che i giri esterni tengono già allineati (giriRepository → sincronizzaRiepilogo).

export interface SottoschedaMancante {
  id: string;
  odp: string;
  numeroScheda: string;
  fornitore: string;
  dataRientroPrevista: string | null;
  // "fuori" = già uscita (In lavorazione Esterna); "in partenza" = esterna ma non ancora uscita
  fase: "fuori" | "in partenza";
}

export interface CompletezzaSottoschede {
  totale: number;
  inSede: number;
  mancanti: SottoschedaMancante[];
  completo: boolean;
}

const STATI_NON_CONTANO = ["Annullata"];

// Le rilavorazioni sono lavoro correttivo, non parte del set di componenti dell'arredo.
function contaNelSet(f: Scheda): boolean {
  return f.tipologia !== "Rilavorazione" && !STATI_NON_CONTANO.includes(f.statoProduzione);
}

function èAncoraEsterna(f: Scheda): SottoschedaMancante["fase"] | null {
  if (f.statoProduzione === "Completato") return null;
  if (f.statoProduzione === "In lavorazione Esterna") return "fuori";
  if (f.produzioneEsterna && f.statoProdEsterna !== "Rientrato") return "in partenza";
  return null;
}

// null se la scheda non ha sottoschede: il caso del componente unico resta com'è oggi.
export function calcolaCompletezza(figlie: Scheda[]): CompletezzaSottoschede | null {
  const set = figlie.filter(contaNelSet);
  if (set.length === 0) return null;
  const mancanti: SottoschedaMancante[] = [];
  for (const f of set) {
    const fase = èAncoraEsterna(f);
    if (fase) {
      mancanti.push({
        id: f.id,
        odp: f.odp,
        numeroScheda: f.numeroScheda,
        fornitore: f.fornitore,
        dataRientroPrevista: f.dataRientroPrevista,
        fase,
      });
    }
  }
  // Prima quelle che rientrano prima; senza data in fondo.
  mancanti.sort((a, b) => (a.dataRientroPrevista ?? "9999").localeCompare(b.dataRientroPrevista ?? "9999"));
  return { totale: set.length, inSede: set.length - mancanti.length, mancanti, completo: mancanti.length === 0 };
}

export function dataBreveIt(d: string | null): string {
  if (!d) return "senza data";
  const [, m, g] = d.slice(0, 10).split("-");
  return m && g ? `${g}/${m}` : d;
}

// "Nome · Fornitore 20/11" per le righe del riquadro.
export function descriviMancante(m: SottoschedaMancante): string {
  const nome = m.numeroScheda || m.odp || "—";
  const dove = m.fornitore ? ` · ${m.fornitore}` : "";
  const quando = m.fase === "fuori" ? ` ${dataBreveIt(m.dataRientroPrevista)}` : " (da inviare)";
  return `${nome}${dove}${quando}`;
}
