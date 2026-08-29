import { pool } from "./db";
import { REPARTI_PRODUZIONE } from "./types";
import { getParametriReparto } from "./parametriRepartoRepository";
import { getCostoOrarioManodopera } from "./parametriGeneraliRepository";
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
  capacitaResidua: number; // capacitaOrdinaria - oreRichieste: positivo = margine libero, negativo = sforo (non clampato)
  oreSforate: number; // eccesso di oreRichieste sulla sola capacitaOrdinaria, 0 se non si sfora
  oreStraordinarioNecessarie: number; // quota di oreSforate coperta dallo straordinario, fino al tetto pctStraordinariMax
  oreEsterneNecessarie: number; // già comprensivo del margine di sicurezza
  numeroEsterniNecessari: number | null; // oreEsterneNecessarie / (ore_giorno_esterno * giorni lavorativi del mese) — null se ore_giorno_esterno non impostato
  // oreEsterneNecessarie / ore_giorno_esterno (SENZA moltiplicare per i giorni del mese): giornate-
  // persona totali di lavoro esterno necessarie, utile per dire a un fornitore "mi servono X
  // giornate" — complementare a numeroEsterniNecessari (che assume un esterno per tutto il mese),
  // non lo stesso conto. Null con lo stesso criterio.
  giorniUomoEsterniNecessari: number | null;
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

// Vista Generale come pool unico (deciso con l'utente 2026-08-08): finché i dati per-reparto
// restano approssimativi (split stimato uguale per tutti gli articoli su standard_reparto,
// alcuni reparti a 0 persone in parametri_reparto), la somma degli sfori calcolati reparto per
// reparto può risultare fuorviante — un reparto con ore libere non copre uno in sofferenza, quindi
// il totale "sforo" può essere alto anche se le ore richieste nel complesso sono sotto la
// capacità ordinaria complessiva. Questa riga tratta l'azienda come un unico reparto: capacità
// e richieste sommate PRIMA di calcolare sfora/straordinario/esterne, non dopo.
export interface RigaTotaleAzienda {
  mese: string;
  capacitaOrdinaria: number;
  capacitaConStraordinari: number;
  oreRichieste: number;
  capacitaResidua: number; // capacitaOrdinaria - oreRichieste: positivo = margine libero, negativo = sforo (non clampato, a differenza di oreSforate)
  oreSforate: number;
  oreStraordinarioNecessarie: number;
  oreEsterneNecessarie: number;
  numeroEsterniNecessari: number | null;
  giorniUomoEsterniNecessari: number | null;
  costoStimato: number | null;
}

export interface RisultatoPrevisionale {
  righe: RigaAggregataPrevisionale[];
  totaliAzienda: RigaTotaleAzienda[];
  richiedonoInputManuale: RigaManualePrevisionale[];
  offerteEscluse: OffertaEsclusaPrevisionale[];
}

// Aggregazione capacità/richieste per reparto e mese (Fase 5.3 Previsionale/Capacity Planner).
// mesiOrizzonte: elenco esplicito di mesi "YYYY-MM" da includere nel risultato — la scelta
// dell'orizzonte (es. prossimi 12 mesi) resta al chiamante (route/UI), non a questa funzione.
export async function calcolaPrevisionale(filtro: FiltroPrevisionale, mesiOrizzonte: string[]): Promise<RisultatoPrevisionale> {
  const [parametri, offerteConRighe, costoOrarioManodopera] = await Promise.all([
    getParametriReparto(), getOfferteAttiveConRighe(), getCostoOrarioManodopera(),
  ]);
  const parametriPerReparto = new Map(parametri.map(p => [p.reparto, p]));
  const mesiValidi = new Set(mesiOrizzonte);

  const richiestePerRepartoMese = new Map<string, Map<string, number>>();
  const stimaPerRepartoMese = new Map<string, Set<string>>();
  const richiedonoInputManuale: RigaManualePrevisionale[] = [];
  const offerteEscluse: OffertaEsclusaPrevisionale[] = [];

  function aggiungiOreReparto(reparto: string, mese: string, ore: number, basatoSuStima: boolean) {
    if (!mesiValidi.has(mese)) return;
    let perMese = richiestePerRepartoMese.get(reparto);
    if (!perMese) { perMese = new Map(); richiestePerRepartoMese.set(reparto, perMese); }
    perMese.set(mese, (perMese.get(mese) ?? 0) + ore);
    if (basatoSuStima) {
      let mesiStima = stimaPerRepartoMese.get(reparto);
      if (!mesiStima) { mesiStima = new Set(); stimaPerRepartoMese.set(reparto, mesiStima); }
      mesiStima.add(mese);
    }
  }

  for (const { offerta, righe, stimaReparto } of offerteConRighe) {
    if (filtro === "confermate" && offerta.stato !== "Confermata") continue;
    const peso = offerta.stato === "Confermata" ? 1 : (filtro === "pesato" ? offerta.probabilitaChiusura / 100 : 1);

    const intervallo = intervalloOfferta(offerta);
    if (!intervallo) {
      if (righe.length > 0 || stimaReparto.length > 0) {
        offerteEscluse.push({
          offertaId: offerta.id, cliente: offerta.cliente, stato: offerta.stato,
          motivo: offerta.stato === "Confermata" ? "manca la data di conferma" : "manca la data di consegna prevista",
        });
      }
      continue;
    }

    // Fallback (deciso con l'utente 2026-08-07): offerta senza righe articolo — non c'è nulla da
    // ripartire per standard_reparto, si stimano le ore totali da valore_commessa/costo orario e
    // si ripartiscono con le percentuali manuali salvate su offerte_stima_reparto.
    if (righe.length === 0) {
      if (stimaReparto.length === 0) {
        offerteEscluse.push({
          offertaId: offerta.id, cliente: offerta.cliente, stato: offerta.stato,
          motivo: "nessuna riga articolo né stima per reparto inserita",
        });
        continue;
      }
      if (offerta.valoreCommessa == null) {
        offerteEscluse.push({ offertaId: offerta.id, cliente: offerta.cliente, stato: offerta.stato, motivo: "manca il valore commessa" });
        continue;
      }
      if (costoOrarioManodopera <= 0) {
        offerteEscluse.push({ offertaId: offerta.id, cliente: offerta.cliente, stato: offerta.stato, motivo: "costo orario manodopera non configurato" });
        continue;
      }
      const oreTotaliStimate = offerta.valoreCommessa / costoOrarioManodopera;
      for (const { reparto, percentuale } of stimaReparto) {
        const distribuzione = distribuisciSuMesi(oreTotaliStimate * (percentuale / 100) * peso, intervallo.inizio, intervallo.fine);
        for (const { mese, ore } of distribuzione) aggiungiOreReparto(reparto, mese, ore, true);
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
        for (const { mese, ore } of distribuzione) aggiungiOreReparto(rr.reparto, mese, ore, basatoSuStima);
      }
    }
  }

  const righeAggregate: RigaAggregataPrevisionale[] = [];
  const totaliPerMese = new Map<string, { capacitaOrdinaria: number; capacitaConStraordinari: number; oreRichieste: number }>();
  for (const reparto of REPARTI_PRODUZIONE) {
    const par = parametriPerReparto.get(reparto);
    for (const mese of mesiOrizzonte) {
      const [anno, meseNum] = mese.split("-").map(Number);
      const giorniMese = giorniLavorativiMese(anno, meseNum);
      const capacitaOrdinaria = (par?.nPersone ?? 0) * (par?.oreGiorno ?? 8) * giorniMese;
      const capacitaConStraordinari = capacitaOrdinaria * (1 + (par?.pctStraordinariMax ?? 0) / 100);
      const oreRichieste = richiestePerRepartoMese.get(reparto)?.get(mese) ?? 0;
      const delta = capacitaConStraordinari - oreRichieste;
      const capacitaResidua = capacitaOrdinaria - oreRichieste;
      const oreSforate = Math.max(0, oreRichieste - capacitaOrdinaria);
      const oreStraordinarioNecessarie = Math.min(oreSforate, capacitaConStraordinari - capacitaOrdinaria);
      const oreEsterneBase = Math.max(0, oreRichieste - capacitaConStraordinari);
      const oreEsterneNecessarie = oreEsterneBase * (1 + (par?.margineSicurezzaEsterni ?? 0) / 100);
      const oreMensiliPerEsterno = par?.oreGiornoEsterno != null ? par.oreGiornoEsterno * giorniMese : null;
      const numeroEsterniNecessari = oreMensiliPerEsterno != null && oreMensiliPerEsterno > 0 ? oreEsterneNecessarie / oreMensiliPerEsterno : null;
      const giorniUomoEsterniNecessari = par?.oreGiornoEsterno != null && par.oreGiornoEsterno > 0 ? oreEsterneNecessarie / par.oreGiornoEsterno : null;
      const costoStimato = par?.tariffaEsternaEurH != null ? oreEsterneNecessarie * par.tariffaEsternaEurH : null;
      const basatoSuStima = stimaPerRepartoMese.get(reparto)?.has(mese) ?? false;
      righeAggregate.push({ reparto, mese, capacitaOrdinaria, capacitaConStraordinari, oreRichieste, delta, capacitaResidua, oreSforate, oreStraordinarioNecessarie, oreEsterneNecessarie, numeroEsterniNecessari, giorniUomoEsterniNecessari, costoStimato, basatoSuStima });

      let tot = totaliPerMese.get(mese);
      if (!tot) { tot = { capacitaOrdinaria: 0, capacitaConStraordinari: 0, oreRichieste: 0 }; totaliPerMese.set(mese, tot); }
      tot.capacitaOrdinaria += capacitaOrdinaria;
      tot.capacitaConStraordinari += capacitaConStraordinari;
      tot.oreRichieste += oreRichieste;
    }
  }

  // Margine/tariffa/ore-giorno esterno non hanno un equivalente "azienda" in parametri_reparto
  // (sono per-reparto) — media pesata per n_persone, coerente con l'idea di trattare l'azienda
  // come un unico reparto di dimensione pari alla somma degli organici.
  let pesoTot = 0, margineP = 0, tariffaPesoTot = 0, tariffaP = 0, oreEsternoPesoTot = 0, oreEsternoP = 0;
  for (const reparto of REPARTI_PRODUZIONE) {
    const par = parametriPerReparto.get(reparto);
    const peso = par?.nPersone ?? 0;
    if (peso <= 0) continue;
    pesoTot += peso;
    margineP += peso * (par?.margineSicurezzaEsterni ?? 0);
    if (par?.tariffaEsternaEurH != null) { tariffaPesoTot += peso; tariffaP += peso * par.tariffaEsternaEurH; }
    if (par?.oreGiornoEsterno != null) { oreEsternoPesoTot += peso; oreEsternoP += peso * par.oreGiornoEsterno; }
  }
  const margineMedio = pesoTot > 0 ? margineP / pesoTot : 0;
  const tariffaMedia = tariffaPesoTot > 0 ? tariffaP / tariffaPesoTot : null;
  const oreGiornoEsternoMedio = oreEsternoPesoTot > 0 ? oreEsternoP / oreEsternoPesoTot : null;

  const totaliAzienda: RigaTotaleAzienda[] = mesiOrizzonte.map(mese => {
    const [anno, meseNum] = mese.split("-").map(Number);
    const giorniMese = giorniLavorativiMese(anno, meseNum);
    const tot = totaliPerMese.get(mese) ?? { capacitaOrdinaria: 0, capacitaConStraordinari: 0, oreRichieste: 0 };
    const capacitaResidua = tot.capacitaOrdinaria - tot.oreRichieste;
    const oreSforate = Math.max(0, tot.oreRichieste - tot.capacitaOrdinaria);
    const oreStraordinarioNecessarie = Math.min(oreSforate, tot.capacitaConStraordinari - tot.capacitaOrdinaria);
    const oreEsterneBase = Math.max(0, tot.oreRichieste - tot.capacitaConStraordinari);
    const oreEsterneNecessarie = oreEsterneBase * (1 + margineMedio / 100);
    const oreMensiliPerEsterno = oreGiornoEsternoMedio != null ? oreGiornoEsternoMedio * giorniMese : null;
    const numeroEsterniNecessari = oreMensiliPerEsterno != null && oreMensiliPerEsterno > 0 ? oreEsterneNecessarie / oreMensiliPerEsterno : null;
    const giorniUomoEsterniNecessari = oreGiornoEsternoMedio != null && oreGiornoEsternoMedio > 0 ? oreEsterneNecessarie / oreGiornoEsternoMedio : null;
    const costoStimato = tariffaMedia != null ? oreEsterneNecessarie * tariffaMedia : null;
    return {
      mese,
      capacitaOrdinaria: tot.capacitaOrdinaria,
      capacitaConStraordinari: tot.capacitaConStraordinari,
      oreRichieste: tot.oreRichieste,
      capacitaResidua,
      oreSforate,
      oreStraordinarioNecessarie,
      oreEsterneNecessarie,
      numeroEsterniNecessari,
      giorniUomoEsterniNecessari,
      costoStimato,
    };
  });

  return { righe: righeAggregate, totaliAzienda, richiedonoInputManuale, offerteEscluse };
}
