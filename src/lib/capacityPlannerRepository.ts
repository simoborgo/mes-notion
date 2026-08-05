import { pool } from "./db";
import { REPARTI_PRODUZIONE } from "./types";
import { getParametriReparto } from "./parametriRepartoRepository";
import { getOfferteAttiveConRighe, type Offerta } from "./offerteRepository";
import { giorniLavorativi, giorniLavorativiMese, mesiCoperti, primoGiornoMese, ultimoGiornoMese } from "./calendarioLavorativo";

export interface RigaOreReparto {
  reparto: string;
  ore: number;
}

export interface OreRepartoRisultato {
  righe: RigaOreReparto[];
  basatoSuStima: boolean;
  // true = nessuna riga standard_reparto per questo articolo (o media_ore tutte a 0):
  // nessuna proposta possibile, il chiamante deve chiedere un input manuale.
  manuale: boolean;
}

// Conversione ore-articolo -> ore-reparto (Fase 5.2 Previsionale): distribuisce le ore
// preventivate di UNA riga di offerta (un articolo) tra i reparti secondo le proporzioni
// osservate in standard_reparto. Calcolata al volo, mai congelata — se standard_reparto
// cambia (nuove chiusure via Fase 4), il risultato cambia alla richiesta successiva.
export async function oreReparto(codiceArticolo: string, orePreventivateTotali: number): Promise<OreRepartoRisultato> {
  const { rows } = await pool.query(
    `SELECT reparto, media_ore, origine FROM standard_reparto WHERE codice_articolo = $1`,
    [codiceArticolo]
  );

  const totaleMedia = rows.reduce((s, r) => s + Number(r.media_ore), 0);
  if (rows.length === 0 || totaleMedia <= 0) {
    return { righe: [], basatoSuStima: false, manuale: true };
  }

  const basatoSuStima = rows.some(r => r.origine === "stimato");
  const righe = rows.map(r => ({
    reparto: r.reparto as string,
    ore: orePreventivateTotali * (Number(r.media_ore) / totaleMedia),
  }));

  return { righe, basatoSuStima, manuale: false };
}

// confermatoIl/aggiornatoIl/creatoIl sono timestamp (non passano per normalizzaData come
// dataOfferta/dataConsegnaPrevista) — pg li restituisce come oggetti Date. Estrazione della
// sola data in locale (mai .toISOString(), stesso bug UTC-off-by-one già noto altrove nel
// progetto, vedi project_mes_gestione_ore_avanzato in memoria).
function soloData(v: string | Date): string {
  const d = v instanceof Date ? v : new Date(v);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface IntervalloOfferta {
  inizio: string;
  fine: string;
}

// Fase 5.3: intervallo su cui distribuire le ore di un'offerta. Confermata -> da confermato_il
// (immutabile, non aggiornato_il) a data_consegna_prevista (sovrascritta col dato reale della
// Commessa alla conferma). Non confermata -> da data_offerta a data_consegna_prevista (stima).
// null = offerta esclusa dal planner (manca il dato necessario), mai un crash.
export function intervalloOfferta(o: Offerta): IntervalloOfferta | null {
  if (!o.dataConsegnaPrevista) return null;
  if (o.stato === "Confermata") {
    if (!o.confermatoIl) return null;
    return { inizio: soloData(o.confermatoIl), fine: o.dataConsegnaPrevista };
  }
  return { inizio: o.dataOfferta, fine: o.dataConsegnaPrevista };
}

export interface RigaMese {
  mese: string; // "YYYY-MM"
  ore: number;
}

// Ripartisce `ore` sui mesi di [inizio, fine] proporzionalmente ai giorni lavorativi di
// ciascun mese ricadenti nell'intervallo (non l'intero mese di calendario, se l'offerta
// inizia/finisce a metà mese). Se nell'intervallo non c'è nessun giorno lavorativo (es. tutto
// festivo, o inizio > fine per un dato incoerente), tutte le ore finiscono nel primo mese
// piuttosto che perderle silenziosamente.
export function distribuisciSuMesi(ore: number, inizio: string, fine: string): RigaMese[] {
  const mesi = mesiCoperti(inizio, fine);
  if (mesi.length === 0) return [];
  if (mesi.length === 1) return [{ mese: mesi[0], ore }];

  const pesi = mesi.map(m => {
    const inizioMese = primoGiornoMese(m);
    const fineMese = ultimoGiornoMese(m);
    const inizioClip = inizioMese < inizio ? inizio : inizioMese;
    const fineClip = fineMese > fine ? fine : fineMese;
    return giorniLavorativi(inizioClip, fineClip);
  });
  const totalePesi = pesi.reduce((s, p) => s + p, 0);
  if (totalePesi === 0) return [{ mese: mesi[0], ore }];
  return mesi.map((m, idx) => ({ mese: m, ore: ore * (pesi[idx] / totalePesi) }));
}

export type FiltroPrevisionale = "confermate" | "tutte" | "pesato";

export interface RigaAggregataPrevisionale {
  reparto: string;
  mese: string;
  capacitaOrdinaria: number;
  capacitaConStraordinari: number;
  oreRichieste: number;
  delta: number; // capacitaConStraordinari - oreRichieste: negativo = scoperto anche con straordinari
  oreEsterneNecessarie: number; // già comprensivo del margine di sicurezza
  costoStimato: number | null; // null se tariffa_esterna_eur_h non impostata
  basatoSuStima: boolean; // almeno una delle offerte che contribuiscono a questa cella usa standard_reparto 'stimato'
}

// Riga di offerta il cui articolo non ha alcuna riga standard_reparto: nessuna proposta di
// ripartizione reparto possibile (non ha senso metterla in nessuna cella del planner) —
// segnalata a parte perché chi guarda il Previsionale sappia che quelle ore non sono conteggiate.
export interface RigaManualePrevisionale {
  offertaId: string;
  cliente: string;
  stato: string;
  codiceArticolo: string;
  orePreventivate: number;
}

// Offerta esclusa dal planner perché manca un dato necessario a calcolare l'intervallo
// temporale (mai un crash, solo un'esclusione segnalata).
export interface OffertaEsclusaPrevisionale {
  offertaId: string;
  cliente: string;
  stato: string;
  motivo: string;
}

export interface RisultatoPrevisionale {
  righe: RigaAggregataPrevisionale[];
  richiedonoInputManuale: RigaManualePrevisionale[];
  offerteEscluse: OffertaEsclusaPrevisionale[];
}

// Aggregazione capacità/richieste per reparto e mese (Fase 5.3 Previsionale/Capacity Planner).
// mesiOrizzonte: elenco esplicito di mesi "YYYY-MM" da includere nel risultato — la scelta
// dell'orizzonte (es. prossimi 12 mesi) resta al chiamante (route/UI), non a questa funzione.
export async function calcolaPrevisionale(filtro: FiltroPrevisionale, mesiOrizzonte: string[]): Promise<RisultatoPrevisionale> {
  const [parametri, offerteConRighe] = await Promise.all([getParametriReparto(), getOfferteAttiveConRighe()]);
  const parametriPerReparto = new Map(parametri.map(p => [p.reparto, p]));
  const mesiValidi = new Set(mesiOrizzonte);

  const richiestePerRepartoMese = new Map<string, Map<string, number>>();
  const stimaPerRepartoMese = new Map<string, Set<string>>();
  const richiedonoInputManuale: RigaManualePrevisionale[] = [];
  const offerteEscluse: OffertaEsclusaPrevisionale[] = [];

  for (const { offerta, righe } of offerteConRighe) {
    if (filtro === "confermate" && offerta.stato !== "Confermata") continue;
    const peso = offerta.stato === "Confermata" ? 1 : (filtro === "pesato" ? offerta.probabilitaChiusura / 100 : 1);

    const intervallo = intervalloOfferta(offerta);
    if (!intervallo) {
      if (righe.length > 0) {
        offerteEscluse.push({
          offertaId: offerta.id, cliente: offerta.cliente, stato: offerta.stato,
          motivo: offerta.stato === "Confermata" ? "manca la data di conferma" : "manca la data di consegna prevista",
        });
      }
      continue;
    }

    for (const riga of righe) {
      const { righe: righeReparto, basatoSuStima, manuale } = await oreReparto(riga.codiceArticolo, riga.orePreventivate);
      if (manuale) {
        richiedonoInputManuale.push({
          offertaId: offerta.id, cliente: offerta.cliente, stato: offerta.stato,
          codiceArticolo: riga.codiceArticolo, orePreventivate: riga.orePreventivate,
        });
        continue;
      }
      for (const rr of righeReparto) {
        const distribuzione = distribuisciSuMesi(rr.ore * peso, intervallo.inizio, intervallo.fine);
        for (const { mese, ore } of distribuzione) {
          if (!mesiValidi.has(mese)) continue;
          let perMese = richiestePerRepartoMese.get(rr.reparto);
          if (!perMese) { perMese = new Map(); richiestePerRepartoMese.set(rr.reparto, perMese); }
          perMese.set(mese, (perMese.get(mese) ?? 0) + ore);

          if (basatoSuStima) {
            let mesiStima = stimaPerRepartoMese.get(rr.reparto);
            if (!mesiStima) { mesiStima = new Set(); stimaPerRepartoMese.set(rr.reparto, mesiStima); }
            mesiStima.add(mese);
          }
        }
      }
    }
  }

  const righeAggregate: RigaAggregataPrevisionale[] = [];
  for (const reparto of REPARTI_PRODUZIONE) {
    const par = parametriPerReparto.get(reparto);
    for (const mese of mesiOrizzonte) {
      const [anno, meseNum] = mese.split("-").map(Number);
      const giorniMese = giorniLavorativiMese(anno, meseNum);
      const capacitaOrdinaria = (par?.nPersone ?? 0) * (par?.oreGiorno ?? 8) * giorniMese;
      const capacitaConStraordinari = capacitaOrdinaria * (1 + (par?.pctStraordinariMax ?? 0) / 100);
      const oreRichieste = richiestePerRepartoMese.get(reparto)?.get(mese) ?? 0;
      const delta = capacitaConStraordinari - oreRichieste;
      const oreEsterneBase = Math.max(0, oreRichieste - capacitaConStraordinari);
      const oreEsterneNecessarie = oreEsterneBase * (1 + (par?.margineSicurezzaEsterni ?? 0) / 100);
      const costoStimato = par?.tariffaEsternaEurH != null ? oreEsterneNecessarie * par.tariffaEsternaEurH : null;
      const basatoSuStima = stimaPerRepartoMese.get(reparto)?.has(mese) ?? false;
      righeAggregate.push({ reparto, mese, capacitaOrdinaria, capacitaConStraordinari, oreRichieste, delta, oreEsterneNecessarie, costoStimato, basatoSuStima });
    }
  }
  return { righe: righeAggregate, richiedonoInputManuale, offerteEscluse };
}
