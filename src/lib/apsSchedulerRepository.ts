import type { PoolClient } from "pg";
import { pool } from "./db";
import { giornoLavorativoAps as giornoLavorativo } from "./calendarioLavorativo";
import { STATI_CHIUSI_ODP } from "./types";
import { logOperation } from "./audit";
import { getOrariTurno, calcolaOreStandard, type OrariTurno } from "./parametriGeneraliRepository";

// ---------------------------------------------------------------------------
// Date locali (mai new Date(isoString)/toISOString — stesso accorgimento già
// usato in tutto il progetto per evitare lo slittamento di fuso orario).
// ---------------------------------------------------------------------------
function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// Il giorno lavorativo successivo (mai lo stesso giorno) — usato sia per il vincolo di
// precedenza 4d (data_disponibilita fase N+1 = fine fase N, giorno dopo) sia per far partire
// una lavorazione sempre da un giorno lavorativo.
function prossimoGiornoLavorativo(d: Date): Date {
  let cand = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  while (!giornoLavorativo(cand)) cand = new Date(cand.getFullYear(), cand.getMonth(), cand.getDate() + 1);
  return cand;
}
function primoGiornoLavorativoDa(d: Date): Date {
  let cand = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  while (!giornoLavorativo(cand)) cand = new Date(cand.getFullYear(), cand.getMonth(), cand.getDate() + 1);
  return cand;
}
// Mai una data pianificata nel passato: qualunque sia l'origine di `data_disponibilita` (scheda
// ricevuta con ritardo, dato storico), il piano non può iniziare prima di oggi — una data futura
// (rimandare volutamente l'inizio) resta invece intatta, è solo un max.
function nonPrimaDi(d: Date, minimo: Date): Date {
  return d < minimo ? minimo : d;
}

// Confine pubblico su stringa ISO — usata da schedeFasiRepository.ts per propagare
// data_disponibilita alla fase successiva quando una fase viene completata a mano (Fase 5),
// stessa regola (4d) già applicata internamente dal motore.
export function prossimaDataDisponibilitaDopo(dataIso: string): string {
  return toIso(prossimoGiornoLavorativo(toDate(dataIso)));
}
export function oggiIso(): string {
  return toIso(new Date());
}
// Aggiunge n giorni LAVORATIVI (n >= 1) a partire da un giorno già lavorativo.
function aggiungiGiorniLavorativi(d: Date, n: number): Date {
  let cand = new Date(d);
  let contati = 1; // il giorno di partenza conta come primo giorno lavorativo del segmento
  while (contati < n) {
    cand = new Date(cand.getFullYear(), cand.getMonth(), cand.getDate() + 1);
    if (giornoLavorativo(cand)) contati++;
  }
  return cand;
}

const PESO_PRIORITA: Record<string, number> = { critica: 4, alta: 3, media: 2, bassa: 1 };
export const BUFFER_CAPACITA = 0.85; // "Capacità pianificabile" spec sez. 4b — 15% di buffer

// Capacità giornaliera reale (feriale vs sabato, dal 2026-08-23) — sostituisce l'assunzione
// "capacitaSett/5" (5 giorni uguali). Ridistribuisce la capacità settimanale pesando sulle ore
// vere di ciascun tipo di giorno (calcolaOreStandard, parametriGeneraliRepository.ts), non su un
// conteggio grezzo di giorni.
export type OreStandard = { oreFeriale: number; oreSabato: number };

// Capacità di un giorno specifico — 0 se non lavorativo per l'APS (domenica/festivo). Usata da
// pianificaMonteOre (già simula giorno per giorno) e da caricoMonteOre (apsGanttRepository.ts).
export function capacitaGiornoReparto(capacitaSett: number, giorno: Date, ore: OreStandard): number {
  if (!giornoLavorativo(giorno)) return 0;
  const pesoSettimana = ore.oreFeriale * 5 + ore.oreSabato;
  if (pesoSettimana <= 0) return 0;
  const oreDelGiorno = giorno.getDay() === 6 ? ore.oreSabato : ore.oreFeriale;
  return capacitaSett * (oreDelGiorno / pesoSettimana) * BUFFER_CAPACITA;
}

// Tasso feriale piatto — usato solo da pianificaCorsie (CNC/Pressa/Sezionatura) per stimare lo
// *span* in giorni di una fase, non una simulazione giorno-per-giorno: stessa semplificazione già
// presente con "/5", solo pesata sulle ore vere invece che su una media grezza che ignorava il
// sabato.
export function capacitaGiornoFeriale(capacitaSett: number, ore: OreStandard): number {
  const pesoSettimana = ore.oreFeriale * 5 + ore.oreSabato;
  if (pesoSettimana <= 0) return 0;
  return capacitaSett * (ore.oreFeriale / pesoSettimana) * BUFFER_CAPACITA;
}

interface Fase {
  id: string;
  schedaId: string;
  repartoId: string;
  ordine: number;
  oreStimate: number | null;
  dataDisponibilita: string | null;
  priorita: string;
  dataConsegna: string | null;
  aRischioPrecedente: boolean;
  odp: string;
  // Fase 9 (drag&drop) — corsia/date già in DB, note solo per le fasi pinnate manualmente
  // (per le altre l'engine le calcola da zero, non serve leggerle).
  corsia: number | null;
  pianificazioneManuale: boolean;
  dataInizioEsistente: string | null;
  dataFineEsistente: string | null;
  // Fase 9b (Vista CNC "Programmazione") — posizione scelta a mano nella coda della corsia
  // indicata da `corsia`; a differenza di pianificazioneManuale non congela le date, solo
  // l'ordine di ingresso e la corsia (vedi confrontaCoda e pianificaCorsie sotto).
  sequenzaManuale: number | null;
}

interface Reparto {
  id: string;
  tipoCapacita: "corsie" | "monte_ore";
  capacitaSett: number | null;
  nRisorseParallele: number | null;
  wipMax: number | null;
  ordinePipeline: number;
  // Modello a ore/giorno (solo reparti a corsie): ogni corsia ha ore utili al giorno dal turno
  // reale, non una giornata intera per lavoro — vedi pianificaCorsieOre.
  modelloOre: boolean;
}

interface Occupazione {
  inizio: Date;
  fine: Date;
  corsia: number;
}

export interface AllocazioneGiorno {
  giorno: string;
  ore: number;
}

export interface Risultato {
  inizio: string;
  fine: string;
  corsia: number | null;
  // Solo modello a ore: ore allocate per giorno (inizio/fine sono min/max di questi giorni).
  allocazioni?: AllocazioneGiorno[];
}

// Confronto coda — spec sez. 4a: priorità > EDD (nulla = in fondo) > data_disponibilita più
// vecchia. Fase 9b: un ordine scelto a mano dall'ufficio programmazione (Vista CNC
// "Programmazione") batte sempre priorità/EDD automatici — è una decisione esplicita, non un
// suggerimento da poter scavalcare. Tra due fasi entrambe manuali vince il numero più basso.
function confrontaCoda(a: Fase, b: Fase): number {
  if (a.sequenzaManuale != null || b.sequenzaManuale != null) {
    if (a.sequenzaManuale != null && b.sequenzaManuale != null) return a.sequenzaManuale - b.sequenzaManuale;
    return a.sequenzaManuale != null ? -1 : 1;
  }
  const pa = PESO_PRIORITA[a.priorita] ?? 2;
  const pb = PESO_PRIORITA[b.priorita] ?? 2;
  if (pa !== pb) return pb - pa;
  const ea = a.dataConsegna ?? "9999-99-99";
  const eb = b.dataConsegna ?? "9999-99-99";
  if (ea !== eb) return ea < eb ? -1 : 1;
  const da = a.dataDisponibilita ?? "9999-99-99";
  const db = b.dataDisponibilita ?? "9999-99-99";
  return da < db ? -1 : da > db ? 1 : 0;
}

// Reparti a corsie — stessa logica di corsia-packing del prototipo mes-aps-simulatore.jsx
// (assegnaCorsie/pianificaFase), riscritta su dati reali. `occupazione` viene mutata in posto:
// ogni fase appena piazzata occupa la sua corsia per i piazzamenti successivi nella stessa coda.
function pianificaCorsie(reparto: Reparto, coda: Fase[], occupazione: Occupazione[], oggi: Date, ore: OreStandard): Map<string, Risultato> {
  const risultati = new Map<string, Risultato>();
  const nCorsie = Math.max(reparto.nRisorseParallele ?? 1, 1);
  const capacitaSett = reparto.capacitaSett;
  const rateGiorno = capacitaSett != null ? capacitaGiornoFeriale(capacitaSett, ore) / nCorsie : null;

  for (const fase of coda) {
    const disponibileDal = nonPrimaDi(primoGiornoLavorativoDa(toDate(fase.dataDisponibilita!)), oggi);

    let corsiaScelta: number;
    let inizio: Date;
    if (fase.sequenzaManuale != null && fase.corsia != null) {
      // Fase 9b: la corsia è quella scelta dall'ufficio programmazione, non la si sceglie tra
      // tutte — si guarda solo quando si libera QUELLA corsia (che, essendo processata nello
      // stesso ordine di `coda`, riflette già i lavori manuali messi prima nella stessa coda).
      corsiaScelta = fase.corsia;
      const occupanti = occupazione.filter((o) => o.corsia === corsiaScelta);
      const liberaDa = occupanti.length === 0
        ? disponibileDal
        : prossimoGiornoLavorativo(occupanti.reduce((max, o) => (o.fine > max ? o.fine : max), occupanti[0].fine));
      inizio = liberaDa > disponibileDal ? liberaDa : disponibileDal;
    } else {
      // Prima corsia libera per ciascuna delle nCorsie, e la prima data utile su ciascuna.
      let migliore: Date | null = null;
      corsiaScelta = 0;
      for (let c = 0; c < nCorsie; c++) {
        const occupanti = occupazione.filter((o) => o.corsia === c);
        const liberaDa = occupanti.length === 0
          ? disponibileDal
          : prossimoGiornoLavorativo(occupanti.reduce((max, o) => (o.fine > max ? o.fine : max), occupanti[0].fine));
        const candidata = liberaDa > disponibileDal ? liberaDa : disponibileDal;
        if (migliore === null || candidata < migliore) {
          migliore = candidata;
          corsiaScelta = c;
        }
      }
      inizio = migliore ?? disponibileDal;
    }

    // Durata: 1 giorno lavorativo "istantaneo" se manca il dato per calcolarla davvero — mai un
    // blocco, mai un crash, solo un placeholder dichiarato (vedi Contesto del piano Fase 3+4).
    const durataGiorni = fase.oreStimate != null && rateGiorno != null
      ? Math.max(Math.ceil(fase.oreStimate / rateGiorno), 1)
      : 1;
    const fine = aggiungiGiorniLavorativi(inizio, durataGiorni);

    occupazione.push({ inizio, fine, corsia: corsiaScelta });
    risultati.set(fase.id, { inizio: toIso(inizio), fine: toIso(fine), corsia: corsiaScelta });
  }
  return risultati;
}

// ---------------------------------------------------------------------------
// Modello a ore/giorno per reparti a corsie (oggi solo CNC) — Fase 10.
// A differenza di pianificaCorsie (giornate intere per lavoro) ogni corsia ha ore utili per
// giorno dal turno reale (Impostazioni → Orari Turno) per il buffer, i lavori consumano quelle ore
// in sequenza e due lavori corti possono stare nello stesso giorno. Il risultato di ogni fase è
// l'elenco delle ore allocate per giorno; inizio/fine restano il min/max di quei giorni.
// ---------------------------------------------------------------------------
export function capacitaOreCorsiaGiorno(giorno: Date, ore: OreStandard): number {
  if (!giornoLavorativo(giorno)) return 0;
  return (giorno.getDay() === 6 ? ore.oreSabato : ore.oreFeriale) * BUFFER_CAPACITA;
}

// Ore già impegnate per (corsia, giorno) e, per corsia, il giorno di inizio dell'ultimo lavoro
// piazzato (un lavoro non parte mai prima del precedente sulla stessa corsia: la coda resta una
// sequenza, non un riempimento libero dei buchi).
export interface StatoOreReparto {
  usate: Map<string, number>;
  floor: Map<number, Date>;
}
const chiaveCella = (corsia: number, giorno: string) => `${corsia}|${giorno}`;

export function nuovoStatoOre(): StatoOreReparto {
  return { usate: new Map(), floor: new Map() };
}

export interface FaseOre {
  id: string;
  oreStimate: number | null;
  dataDisponibilita: string | null;
  corsia: number | null;
  sequenzaManuale: number | null;
}

// Simula (senza scrivere nulla) l'allocazione di `ore` ore su una corsia a partire da `da`,
// riempiendo il residuo di ogni giorno lavorativo finché non sono finite.
function simulaAllocazione(corsia: number, da: Date, ore: number, usate: Map<string, number>, oreStd: OreStandard): AllocazioneGiorno[] {
  const alloc: AllocazioneGiorno[] = [];
  let residuo = ore;
  let cur = new Date(da.getFullYear(), da.getMonth(), da.getDate());
  for (let i = 0; i < 3650 && residuo > 0.005; i++) {
    const iso = toIso(cur);
    const libero = capacitaOreCorsiaGiorno(cur, oreStd) - (usate.get(chiaveCella(corsia, iso)) ?? 0);
    // Mai oltre la capacità: se il residuo sta nel giorno lo si prende intero (arrotondato), altrimenti
    // si riempie il giorno per difetto al centesimo.
    const prendo = residuo <= libero ? Math.round(residuo * 100) / 100 : Math.floor(libero * 100) / 100;
    if (prendo > 0) {
      alloc.push({ giorno: iso, ore: prendo });
      residuo -= prendo;
    }
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return alloc;
}

function impegna(corsia: number, alloc: AllocazioneGiorno[], stato: StatoOreReparto): void {
  for (const a of alloc) {
    const k = chiaveCella(corsia, a.giorno);
    stato.usate.set(k, (stato.usate.get(k) ?? 0) + a.ore);
  }
}

// Distribuisce le ore di una fase pinnata a mano (date congelate) sul suo intervallo, in
// proporzione alla capacità di ciascun giorno — occupazione fissa che il resto della coda deve
// aggirare, non ricalcolata dal motore.
export function distribuisciSuIntervallo(inizio: string, fine: string, ore: number, oreStd: OreStandard): AllocazioneGiorno[] {
  const pesi: { giorno: string; peso: number }[] = [];
  let cur = toDate(inizio);
  const ultimo = toDate(fine);
  while (cur <= ultimo) {
    pesi.push({ giorno: toIso(cur), peso: capacitaOreCorsiaGiorno(cur, oreStd) });
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  const somma = pesi.reduce((s, p) => s + p.peso, 0);
  if (somma <= 0) return [{ giorno: inizio, ore }];
  return pesi.filter((p) => p.peso > 0).map((p) => ({ giorno: p.giorno, ore: Math.round((ore * p.peso / somma) * 100) / 100 }));
}

// `stato` viene mutato: ogni fase piazzata impegna le sue ore per i piazzamenti successivi.
// Corsia forzata se la fase ha una sequenza manuale (Fase 9b), altrimenti quella che termina prima
// (parità: inizia prima, poi indice minore). Durata minima 0,25h; ore stimate mancanti = 1h
// (stesso placeholder dichiarato di pianificaCorsie: mai un blocco, mai un crash).
export function pianificaCorsieOre(nCorsie: number, coda: FaseOre[], stato: StatoOreReparto, oggi: Date, oreStd: OreStandard): Map<string, Risultato> {
  const risultati = new Map<string, Risultato>();
  const totaleCorsie = Math.max(nCorsie, 1);

  for (const fase of coda) {
    const oreFase = Math.max(fase.oreStimate ?? 1, 0.25);
    const disponibileDal = nonPrimaDi(primoGiornoLavorativoDa(toDate(fase.dataDisponibilita!)), oggi);
    const candidate = fase.sequenzaManuale != null && fase.corsia != null
      ? [fase.corsia]
      : Array.from({ length: totaleCorsie }, (_, c) => c);

    let migliore: { corsia: number; alloc: AllocazioneGiorno[] } | null = null;
    for (const c of candidate) {
      const floor = stato.floor.get(c);
      const da = floor && floor > disponibileDal ? floor : disponibileDal;
      const alloc = simulaAllocazione(c, da, oreFase, stato.usate, oreStd);
      if (alloc.length === 0) continue;
      const fine = alloc[alloc.length - 1].giorno;
      const fineMigliore = migliore ? migliore.alloc[migliore.alloc.length - 1].giorno : null;
      if (!migliore || fine < fineMigliore! || (fine === fineMigliore && alloc[0].giorno < migliore.alloc[0].giorno)) {
        migliore = { corsia: c, alloc };
      }
    }

    if (!migliore) {
      // Nessuna capacità utile (turni a zero): fase istantanea sul primo giorno disponibile.
      risultati.set(fase.id, { inizio: toIso(disponibileDal), fine: toIso(disponibileDal), corsia: candidate[0], allocazioni: [] });
      continue;
    }
    impegna(migliore.corsia, migliore.alloc, stato);
    stato.floor.set(migliore.corsia, toDate(migliore.alloc[0].giorno));
    risultati.set(fase.id, {
      inizio: migliore.alloc[0].giorno,
      fine: migliore.alloc[migliore.alloc.length - 1].giorno,
      corsia: migliore.corsia,
      allocazioni: migliore.alloc,
    });
  }
  return risultati;
}

// Registra come occupazione fissa (senza piazzarle) le allocazioni di una fase già decisa —
// pin a date, o fasi in lavorazione già simulate.
export function impegnaAllocazioni(corsia: number, alloc: AllocazioneGiorno[], stato: StatoOreReparto): void {
  impegna(corsia, alloc, stato);
}

// Reparti a monte ore — spec sez. 4c: simulazione giorno per giorno, insieme attivo = i primi
// wip_max ODP in coda con disponibilità raggiunta, quota giornaliera pesata per priorità.
function pianificaMonteOre(reparto: Reparto, coda: Fase[], oggi: Date, ore: OreStandard): Map<string, Risultato> {
  const risultati = new Map<string, Risultato>();
  if (coda.length === 0) return risultati;

  const capacitaSett = reparto.capacitaSett;
  // Nessuna vera capacità nota: ogni fase della coda si considera istantanea, un giorno
  // lavorativo dopo la sua disponibilità — nessuna quota da simulare.
  if (capacitaSett == null) {
    for (const fase of coda) {
      const inizio = nonPrimaDi(primoGiornoLavorativoDa(toDate(fase.dataDisponibilita!)), oggi);
      const fine = aggiungiGiorniLavorativi(inizio, 1);
      risultati.set(fase.id, { inizio: toIso(inizio), fine: toIso(fine), corsia: null });
    }
    return risultati;
  }

  const wipMax = reparto.wipMax ?? Infinity;

  // Stato di lavorazione residua per fase (in ore) — le fasi con ore_stimate NULL si
  // considerano istantanee (1h placeholder), coerente col trattamento generale del dato mancante.
  const residue = new Map<string, number>(coda.map((f) => [f.id, f.oreStimate ?? 1]));
  const inCoda = [...coda]; // rispetta l'ordinamento già applicato dal chiamante (4a)
  const attivi: Fase[] = [];
  const inizioReale = new Map<string, Date>();

  // Il primo giorno utile è il minimo tra tutte le disponibilità in coda, non solo la prima
  // in ordine di priorità — un ODP a priorità bassa ma già disponibile prima può comunque
  // avviare la simulazione.
  const primaDisponibilita = coda.reduce((min, f) => {
    const d = toDate(f.dataDisponibilita!);
    return d < min ? d : min;
  }, toDate(coda[0].dataDisponibilita!));
  let giorno = nonPrimaDi(primoGiornoLavorativoDa(primaDisponibilita), oggi);
  let guardia = 0; // sicurezza anti-loop-infinito: mai più di 5 anni di giorni simulati
  while ((inCoda.length > 0 || attivi.length > 0) && guardia < 365 * 5) {
    guardia++;
    if (!giornoLavorativo(giorno)) {
      giorno = new Date(giorno.getFullYear(), giorno.getMonth(), giorno.getDate() + 1);
      continue;
    }
    // Ammissione nell'insieme attivo: scandisce la coda IN ORDINE DI PRIORITÀ (non solo la
    // testa), ammettendo chi ha già raggiunto la disponibilità e saltando (senza rimuoverli)
    // quelli non ancora disponibili — così un critico non ancora pronto non blocca uno slot
    // che un altro ODP già disponibile potrebbe occupare oggi.
    for (let idx = 0; idx < inCoda.length && attivi.length < wipMax; ) {
      if (toDate(inCoda[idx].dataDisponibilita!) <= giorno) {
        const [f] = inCoda.splice(idx, 1);
        attivi.push(f);
        inizioReale.set(f.id, giorno);
      } else {
        idx++;
      }
    }
    if (attivi.length === 0) {
      // Nessuno ancora disponibile oggi: salta al prossimo giorno lavorativo (o esce se non
      // resta nulla da aspettare, evitando di girare a vuoto).
      if (inCoda.length === 0) break;
      giorno = new Date(giorno.getFullYear(), giorno.getMonth(), giorno.getDate() + 1);
      continue;
    }

    const capacitaGiorno = capacitaGiornoReparto(capacitaSett, giorno, ore);
    const sommaPesi = attivi.reduce((s, f) => s + (PESO_PRIORITA[f.priorita] ?? 2), 0);
    for (const f of [...attivi]) {
      const quota = capacitaGiorno * ((PESO_PRIORITA[f.priorita] ?? 2) / sommaPesi);
      const residuo = residue.get(f.id)!;
      const nuovoResiduo = residuo - quota;
      if (nuovoResiduo <= 0) {
        risultati.set(f.id, { inizio: toIso(inizioReale.get(f.id)!), fine: toIso(giorno), corsia: null });
        attivi.splice(attivi.indexOf(f), 1);
      } else {
        residue.set(f.id, nuovoResiduo);
      }
    }
    giorno = new Date(giorno.getFullYear(), giorno.getMonth(), giorno.getDate() + 1);
  }
  // Eventuali fasi ancora attive quando la guardia anti-loop scatta (dato non plausibile):
  // chiuse comunque all'ultimo giorno simulato, mai lasciate senza risultato.
  for (const f of attivi) {
    risultati.set(f.id, { inizio: toIso(inizioReale.get(f.id) ?? giorno), fine: toIso(giorno), corsia: null });
  }
  return risultati;
}

export interface AnteprimaFase {
  faseId: string;
  odp: string;
  repartoId: string;
  statoFase: "Da iniziare" | "In lavorazione";
  vecchio: { inizio: string | null; fine: string | null; corsia: number | null };
  nuovo: { inizio: string; fine: string; corsia: number | null };
  allocazioni: AllocazioneGiorno[];
  oreResidue?: number;
}

export interface RisultatoRicalcolo {
  fasiPianificate: number;
  odpARischio: number;
  // Solo in dryRun: cosa cambierebbe nei reparti a ore, senza aver scritto nulla.
  anteprima?: AnteprimaFase[];
}

export interface OpzioniRicalcolo {
  // Calcola tutto ma non scrive nulla sul DB (né date, né allocazioni, né a_rischio).
  dryRun?: boolean;
  // Tratta questi reparti (a corsie) come modello a ore anche se reparti.modello_ore è false —
  // per vedere l'anteprima prima di attivarlo davvero.
  forzaModelloOre?: string[];
}

// Nome del reparto in ore_registrate (nome storico) per i reparti a ore — stessa convenzione di
// REPARTO_ID_A_NOME_STORICO (schedeFasiRepository.ts), duplicata qui perché quel modulo importa
// questo (import circolare).
const NOME_STORICO_REPARTO_ORE: Record<string, string> = { cnc: "CNC" };

// Motore completo — attraversa tutta la pipeline in un solo passaggio (ordine_pipeline),
// applicando 4b (corsie) o 4c (monte ore) reparto per reparto e propagando le date a valle
// (4d). Mai tocca le fasi già 'In lavorazione'/'Completato'. Vedi il piano Fase 3+4 per i
// dettagli e le decisioni sui dati mancanti (capacità/ore_stimate NULL -> fase istantanea).
export async function ricalcolaPiano(opzioni: OpzioniRicalcolo = {}): Promise<RisultatoRicalcolo> {
  const dryRun = opzioni.dryRun === true;
  const forzaModelloOre = new Set(opzioni.forzaModelloOre ?? []);
  // Orari turno (feriale/sabato) — una sola lettura per tutto il ricalcolo, non per fase.
  const orariTurno: OrariTurno = await getOrariTurno();
  const oreStandard: OreStandard = calcolaOreStandard(orariTurno);

  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: repartiRows } = await client.query(
      `SELECT id, tipo_capacita, capacita_sett, n_risorse_parallele, wip_max, ordine_pipeline, modello_ore
       FROM reparti ORDER BY ordine_pipeline`
    );
    const reparti: Reparto[] = repartiRows.map((r) => ({
      id: r.id,
      tipoCapacita: r.tipo_capacita,
      capacitaSett: r.capacita_sett != null ? Number(r.capacita_sett) : null,
      nRisorseParallele: r.n_risorse_parallele != null ? Number(r.n_risorse_parallele) : null,
      wipMax: r.wip_max != null ? Number(r.wip_max) : null,
      ordinePipeline: Number(r.ordine_pipeline),
      modelloOre: r.tipo_capacita === "corsie" && (r.modello_ore === true || forzaModelloOre.has(r.id)),
    }));
    const repartiOre = new Set(reparti.filter((r) => r.modelloOre).map((r) => r.id));
    const statoOrePerReparto = new Map<string, StatoOreReparto>();
    for (const id of repartiOre) statoOrePerReparto.set(id, nuovoStatoOre());
    // Allocazioni orarie di ogni fase dei reparti a ore, nell'ordine in cui vengono decise
    // (fasi in lavorazione, poi pin a date, poi coda) — l'ordine dentro lo stesso giorno/corsia.
    const allocazioniPerFase = new Map<string, { corsia: number; alloc: AllocazioneGiorno[] }>();
    const anteprima: AnteprimaFase[] = [];

    // schede.stato e schede_fasi.stato_fase non sono sincronizzati (nessun ponte automatico,
    // per design): una scheda già segnata Completato/Annullata a mano ma con fasi rimaste
    // "Da iniziare" (mai toccate) non deve comunque essere pianificata attivamente — stessa
    // costante STATI_CHIUSI_ODP già usata altrove nel progetto per questo scopo.
    const { rows: fasiRows } = await client.query(
      `SELECT sf.id, sf.scheda_id, sf.reparto_id, sf.ordine, sf.ore_stimate, sf.data_disponibilita,
              sf.a_rischio, sf.corsia, sf.pianificazione_manuale, sf.sequenza_manuale,
              sf.data_inizio_pianificata, sf.data_fine_pianificata,
              s.priorita, s.odp, s.data_produzione_prevista
       FROM schede_fasi sf
       JOIN schede s ON s.id = sf.scheda_id
       WHERE sf.stato_fase = 'Da iniziare' AND sf.esclusa = false AND s.archiviata = false AND NOT (s.stato = ANY($1))`,
      [STATI_CHIUSI_ODP]
    );
    const fasi = new Map<string, Fase>(
      fasiRows.map((r) => [r.id, {
        id: r.id,
        schedaId: r.scheda_id,
        repartoId: r.reparto_id,
        ordine: Number(r.ordine),
        oreStimate: r.ore_stimate != null ? Number(r.ore_stimate) : null,
        dataDisponibilita: r.data_disponibilita ? toIso(new Date(r.data_disponibilita)) : null,
        priorita: r.priorita,
        dataConsegna: r.data_produzione_prevista ? toIso(new Date(r.data_produzione_prevista)) : null,
        aRischioPrecedente: r.a_rischio,
        odp: r.odp,
        corsia: r.corsia != null ? Number(r.corsia) : null,
        pianificazioneManuale: r.pianificazione_manuale,
        dataInizioEsistente: r.data_inizio_pianificata ? toIso(new Date(r.data_inizio_pianificata)) : null,
        dataFineEsistente: r.data_fine_pianificata ? toIso(new Date(r.data_fine_pianificata)) : null,
        sequenzaManuale: r.sequenza_manuale != null ? Number(r.sequenza_manuale) : null,
      }])
    );

    // Indice: prossima fase (stessa scheda, ordine immediatamente superiore) tra quelle "Da
    // iniziare" caricate — usato per la propagazione 4d.
    const fasiPerScheda = new Map<string, Fase[]>();
    for (const f of fasi.values()) {
      const arr = fasiPerScheda.get(f.schedaId) ?? [];
      arr.push(f);
      fasiPerScheda.set(f.schedaId, arr);
    }
    for (const arr of fasiPerScheda.values()) arr.sort((a, b) => a.ordine - b.ordine);
    function prossimaFase(f: Fase): Fase | null {
      const arr = fasiPerScheda.get(f.schedaId)!;
      const idx = arr.findIndex((x) => x.id === f.id);
      return idx >= 0 && idx + 1 < arr.length ? arr[idx + 1] : null;
    }

    // Occupazione corsie preesistente: fasi già ferme (non "Da iniziare") con corsia assegnata.
    const { rows: occupateRows } = await client.query(
      `SELECT sf.reparto_id, sf.corsia, sf.data_inizio_pianificata, sf.data_fine_pianificata
       FROM schede_fasi sf JOIN schede s ON s.id = sf.scheda_id
       WHERE sf.stato_fase != 'Da iniziare' AND sf.corsia IS NOT NULL AND s.archiviata = false
         AND NOT (s.stato = ANY($1))
         AND sf.data_inizio_pianificata IS NOT NULL AND sf.data_fine_pianificata IS NOT NULL`,
      [STATI_CHIUSI_ODP]
    );
    // Un array per reparto, mai ricreato — accumula l'occupazione corsie tra una passata e la
    // successiva (vedi sotto: uno stesso reparto può comparire più volte nella pipeline di un
    // pattern, es. Ufficio Tecnico Distinta Base + Sviluppo CNC, Tranciatura-Pressa Tranciatura
    // + Pressa — serve che la seconda "veda" la corsia occupata dalla prima).
    const occupazionePerReparto = new Map<string, Occupazione[]>();
    for (const reparto of reparti) occupazionePerReparto.set(reparto.id, []);
    for (const r of occupateRows) {
      // Reparti a ore: le fasi in lavorazione non occupano più per date congelate ma per ore
      // residue, calcolate qui sotto — non vanno contate due volte.
      if (repartiOre.has(r.reparto_id)) continue;
      occupazionePerReparto.get(r.reparto_id)!.push({
        inizio: new Date(r.data_inizio_pianificata), fine: new Date(r.data_fine_pianificata), corsia: Number(r.corsia),
      });
    }

    const risultatiTotali = new Map<string, Risultato>();
    const oggi = primoGiornoLavorativoDa(toDate(oggiIso()));

    // Fasi già "In lavorazione" nei reparti a ore (Fase 10): occupano la loro corsia per le ore
    // RESIDUE (stima − ore già registrate su quel reparto per l'ODP, minimo 1h finché la fase non è
    // completata), a partire da oggi e prima di tutta la coda. Se la fase sfora la stima resta
    // comunque una macchina occupata, non più una fase "fantasma" con date vecchie.
    const inCorso: { faseId: string; repartoId: string; odp: string; risultato: Risultato; inizioReale: string | null; oreResidue: number;
      vecchio: { inizio: string | null; fine: string | null; corsia: number | null } }[] = [];
    if (repartiOre.size > 0) {
      const { rows: inCorsoRows } = await client.query(
        `SELECT sf.id, sf.reparto_id, sf.ore_stimate, sf.corsia, sf.data_inizio_pianificata, sf.data_fine_pianificata, s.odp
         FROM schede_fasi sf JOIN schede s ON s.id = sf.scheda_id
         WHERE sf.stato_fase = 'In lavorazione' AND sf.esclusa = false AND s.archiviata = false
           AND NOT (s.stato = ANY($1)) AND sf.reparto_id = ANY($2)
         ORDER BY sf.data_inizio_pianificata NULLS LAST`,
        [STATI_CHIUSI_ODP, [...repartiOre]]
      );
      const nomiReparto = [...repartiOre].map((id) => NOME_STORICO_REPARTO_ORE[id] ?? id);
      const { rows: oreRegRows } = inCorsoRows.length === 0 ? { rows: [] as { odp: string; reparto: string; ore: string }[] } : await client.query(
        `SELECT odp, reparto, SUM(ore) AS ore FROM ore_registrate
         WHERE rif = false AND reparto = ANY($1) AND odp = ANY($2) GROUP BY odp, reparto`,
        [nomiReparto, [...new Set(inCorsoRows.map((r) => r.odp as string))]]
      );
      const oreRegistrate = new Map<string, number>(oreRegRows.map((r) => [`${r.reparto}|${r.odp}`, Number(r.ore)]));
      for (const r of inCorsoRows) {
        const nome = NOME_STORICO_REPARTO_ORE[r.reparto_id] ?? r.reparto_id;
        const stima = r.ore_stimate != null ? Number(r.ore_stimate) : null;
        const reali = oreRegistrate.get(`${nome}|${r.odp}`) ?? 0;
        const oreResidue = stima != null ? Math.max(stima - reali, 1) : 1;
        const corsia = r.corsia != null ? Number(r.corsia) : null;
        const rep = reparti.find((x) => x.id === r.reparto_id)!;
        const ris = pianificaCorsieOre(
          rep.nRisorseParallele ?? 1,
          [{ id: r.id, oreStimate: oreResidue, dataDisponibilita: oggiIso(), corsia, sequenzaManuale: corsia != null ? 0 : null }],
          statoOrePerReparto.get(r.reparto_id)!, oggi, oreStandard
        ).get(r.id)!;
        inCorso.push({
          faseId: r.id, repartoId: r.reparto_id, odp: r.odp, risultato: ris, oreResidue,
          inizioReale: r.data_inizio_pianificata ? toIso(new Date(r.data_inizio_pianificata)) : null,
          vecchio: {
            inizio: r.data_inizio_pianificata ? toIso(new Date(r.data_inizio_pianificata)) : null,
            fine: r.data_fine_pianificata ? toIso(new Date(r.data_fine_pianificata)) : null,
            corsia,
          },
        });
        if (ris.corsia != null && ris.allocazioni) allocazioniPerFase.set(r.id, { corsia: ris.corsia, alloc: ris.allocazioni });
      }
    }

    // Fasi pinnate manualmente (Fase 9, drag&drop) — seminate direttamente in risultatiTotali
    // con le date/corsia già in DB, PRIMA del loop a punto fisso: questo le esclude di suo dalla
    // coda di ripianificazione (il filtro `!risultatiTotali.has(f.id)` più sotto le salta già),
    // le rende visibili come occupazione corsia reale alle altre fasi dello stesso reparto, e fa
    // scattare la stessa propagazione data_disponibilita (4d) che riceverebbe una fase appena
    // calcolata — trattamento identico, solo che il risultato non lo calcola l'engine ma l'utente.
    for (const f of fasi.values()) {
      if (!f.pianificazioneManuale || !f.dataInizioEsistente || !f.dataFineEsistente) continue;
      risultatiTotali.set(f.id, { inizio: f.dataInizioEsistente, fine: f.dataFineEsistente, corsia: f.corsia });
      if (repartiOre.has(f.repartoId)) {
        // Reparto a ore: le ore stimate si distribuiscono sull'intervallo congelato, in proporzione
        // alla capacità di ogni giorno, e contano come occupazione fissa.
        if (f.corsia != null) {
          const alloc = distribuisciSuIntervallo(f.dataInizioEsistente, f.dataFineEsistente, Math.max(f.oreStimate ?? 1, 0.25), oreStandard);
          impegnaAllocazioni(f.corsia, alloc, statoOrePerReparto.get(f.repartoId)!);
          allocazioniPerFase.set(f.id, { corsia: f.corsia, alloc });
        }
      } else if (f.corsia != null) {
        occupazionePerReparto.get(f.repartoId)?.push({
          inizio: toDate(f.dataInizioEsistente), fine: toDate(f.dataFineEsistente), corsia: f.corsia,
        });
      }
      const successiva = prossimaFase(f);
      if (successiva) successiva.dataDisponibilita = toIso(prossimoGiornoLavorativo(toDate(f.dataFineEsistente)));
    }

    // Una singola passata in ordine_pipeline NON basta: due sotto-fasi sequenziali dello STESSO
    // reparto (es. Distinta Base -> Sviluppo CNC, entrambe su Ufficio Tecnico) fanno sì che la
    // seconda sblocchi la sua data_disponibilita solo quando la prima è già stata pianificata —
    // nella stessa passata sarebbe ancora NULL. Si continua a spazzolare la pipeline finché una
    // passata intera non pianifica più nulla di nuovo (punto fisso), con un tetto di sicurezza.
    let progredito = true;
    let giroSicurezza = 0;
    while (progredito && giroSicurezza < 50) {
      progredito = false;
      giroSicurezza++;
      for (const reparto of reparti) {
        const coda = [...fasi.values()]
          .filter((f) => f.repartoId === reparto.id && f.dataDisponibilita != null && !risultatiTotali.has(f.id))
          .sort(confrontaCoda);
        if (coda.length === 0) continue;
        progredito = true;

        const risultatiReparto = reparto.modelloOre
          ? pianificaCorsieOre(reparto.nRisorseParallele ?? 1, coda, statoOrePerReparto.get(reparto.id)!, oggi, oreStandard)
          : reparto.tipoCapacita === "corsie"
            ? pianificaCorsie(reparto, coda, occupazionePerReparto.get(reparto.id)!, oggi, oreStandard)
            : pianificaMonteOre(reparto, coda, oggi, oreStandard);

        for (const [faseId, res] of risultatiReparto) {
          risultatiTotali.set(faseId, res);
          if (reparto.modelloOre && res.corsia != null && res.allocazioni) {
            allocazioniPerFase.set(faseId, { corsia: res.corsia, alloc: res.allocazioni });
          }
          const fase = fasi.get(faseId)!;
          const successiva = prossimaFase(fase);
          if (successiva) {
            successiva.dataDisponibilita = toIso(prossimoGiornoLavorativo(toDate(res.fine)));
          }
        }
      }
    }

    for (const [faseId, res] of risultatiTotali) {
      const fase = fasi.get(faseId)!;
      if (repartiOre.has(fase.repartoId) && !fase.pianificazioneManuale) {
        anteprima.push({
          faseId, odp: fase.odp, repartoId: fase.repartoId, statoFase: "Da iniziare",
          vecchio: { inizio: fase.dataInizioEsistente, fine: fase.dataFineEsistente, corsia: fase.corsia },
          nuovo: { inizio: res.inizio, fine: res.fine, corsia: res.corsia },
          allocazioni: res.allocazioni ?? [],
        });
      }
      // Fasi pinnate: il risultato è esattamente ciò che già c'era in DB (seminato sopra),
      // riscriverlo toccherebbe solo aggiornato_il senza motivo.
      if (fase.pianificazioneManuale || dryRun) continue;
      await client.query(
        `UPDATE schede_fasi SET data_inizio_pianificata = $1, data_fine_pianificata = $2, corsia = $3, aggiornato_il = now() WHERE id = $4`,
        [res.inizio, res.fine, res.corsia, faseId]
      );
    }

    // Fasi in lavorazione dei reparti a ore: mai toccata la data di inizio (è l'avvio reale), solo
    // la fine ricalcolata dalle ore residue (mai prima dell'inizio: vincolo fine >= inizio).
    for (const c of inCorso) {
      anteprima.push({
        faseId: c.faseId, odp: c.odp, repartoId: c.repartoId, statoFase: "In lavorazione",
        vecchio: c.vecchio,
        nuovo: { inizio: c.inizioReale ?? c.risultato.inizio, fine: c.risultato.fine, corsia: c.risultato.corsia },
        allocazioni: c.risultato.allocazioni ?? [], oreResidue: c.oreResidue,
      });
      if (dryRun) continue;
      await client.query(
        `UPDATE schede_fasi SET data_fine_pianificata = GREATEST($1::date, data_inizio_pianificata),
           corsia = COALESCE(corsia, $2), aggiornato_il = now() WHERE id = $3`,
        [c.risultato.fine, c.risultato.corsia, c.faseId]
      );
    }

    // Allocazioni orarie: per i reparti a ore si cancellano quelle delle fasi ricalcolate e si
    // riscrivono in blocco (mai una INSERT per riga).
    if (!dryRun && repartiOre.size > 0) {
      const idDaPulire = [
        ...[...fasi.values()].filter((f) => repartiOre.has(f.repartoId)).map((f) => f.id),
        ...inCorso.map((c) => c.faseId),
      ];
      await client.query(`DELETE FROM schede_fasi_allocazioni WHERE fase_id = ANY($1::uuid[])`, [idDaPulire]);
      const fIds: string[] = [], giorni: string[] = [], corsie: number[] = [], oreV: number[] = [], ordini: number[] = [];
      const contatoreCella = new Map<string, number>();
      for (const [faseId, { corsia, alloc }] of allocazioniPerFase) {
        for (const a of alloc) {
          const k = chiaveCella(corsia, a.giorno);
          const ordine = (contatoreCella.get(k) ?? 0) + 1;
          contatoreCella.set(k, ordine);
          fIds.push(faseId); giorni.push(a.giorno); corsie.push(corsia); oreV.push(a.ore); ordini.push(ordine);
        }
      }
      if (fIds.length > 0) {
        await client.query(
          `INSERT INTO schede_fasi_allocazioni (fase_id, giorno, corsia, ore, ordine_giorno)
           SELECT * FROM unnest($1::uuid[], $2::date[], $3::int[], $4::numeric[], $5::int[])`,
          [fIds, giorni, corsie, oreV, ordini]
        );
      }
    }

    // a_rischio (4g): per ogni ODP toccato in questo giro, guarda l'ultima fase per `ordine` —
    // se ha un risultato appena calcolato ed EDD nota, confronta; altrimenti lascia invariato.
    // Le transizioni false->true (non semplicemente "è a rischio") si registrano in audit log
    // come avviso minimo — il canale di notifica vero resta Fase 6, non anticipato qui.
    let odpARischio = 0;
    const nuoviARischio: { schedaId: string; odp: string }[] = [];
    for (const arr of fasiPerScheda.values()) {
      const ultima = arr[arr.length - 1];
      const res = risultatiTotali.get(ultima.id);
      if (!res || !ultima.dataConsegna) continue;
      const aRischio = res.fine > ultima.dataConsegna;
      if (!dryRun) await client.query(`UPDATE schede_fasi SET a_rischio = $1 WHERE id = $2`, [aRischio, ultima.id]);
      if (aRischio) {
        odpARischio++;
        if (!ultima.aRischioPrecedente) nuoviARischio.push({ schedaId: ultima.schedaId, odp: ultima.odp });
      }
    }

    if (dryRun) {
      await client.query("ROLLBACK");
      return { fasiPianificate: risultatiTotali.size, odpARischio, anteprima };
    }
    await client.query("COMMIT");

    for (const { schedaId, odp } of nuoviARischio) {
      void logOperation("Sistema", "UPDATE", "scheda", schedaId, { evento: "nuovo_a_rischio", odp });
    }

    return { fasiPianificate: risultatiTotali.size, odpARischio };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
