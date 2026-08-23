import type { PoolClient } from "pg";
import { pool } from "./db";
import { giornoLavorativo } from "./calendarioLavorativo";
import { STATI_CHIUSI_ODP } from "./types";
import { logOperation } from "./audit";

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
}

interface Reparto {
  id: string;
  tipoCapacita: "corsie" | "monte_ore";
  capacitaSett: number | null;
  nRisorseParallele: number | null;
  wipMax: number | null;
  ordinePipeline: number;
}

interface Occupazione {
  inizio: Date;
  fine: Date;
  corsia: number;
}

interface Risultato {
  inizio: string;
  fine: string;
  corsia: number | null;
}

// Confronto coda — spec sez. 4a: priorità > EDD (nulla = in fondo) > data_disponibilita più vecchia.
function confrontaCoda(a: Fase, b: Fase): number {
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
function pianificaCorsie(reparto: Reparto, coda: Fase[], occupazione: Occupazione[], oggi: Date): Map<string, Risultato> {
  const risultati = new Map<string, Risultato>();
  const nCorsie = Math.max(reparto.nRisorseParallele ?? 1, 1);
  const capacitaSett = reparto.capacitaSett;
  const rateGiorno = capacitaSett != null ? (capacitaSett / 5) * BUFFER_CAPACITA / nCorsie : null;

  for (const fase of coda) {
    const disponibileDal = nonPrimaDi(primoGiornoLavorativoDa(toDate(fase.dataDisponibilita!)), oggi);

    // Prima corsia libera per ciascuna delle nCorsie, e la prima data utile su ciascuna.
    let migliore: Date | null = null;
    let corsiaScelta = 0;
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
    const inizio = migliore ?? disponibileDal;

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

// Reparti a monte ore — spec sez. 4c: simulazione giorno per giorno, insieme attivo = i primi
// wip_max ODP in coda con disponibilità raggiunta, quota giornaliera pesata per priorità.
function pianificaMonteOre(reparto: Reparto, coda: Fase[], oggi: Date): Map<string, Risultato> {
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

  const capacitaGiorno = (capacitaSett / 5) * BUFFER_CAPACITA;
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

export interface RisultatoRicalcolo {
  fasiPianificate: number;
  odpARischio: number;
}

// Motore completo — attraversa tutta la pipeline in un solo passaggio (ordine_pipeline),
// applicando 4b (corsie) o 4c (monte ore) reparto per reparto e propagando le date a valle
// (4d). Mai tocca le fasi già 'In lavorazione'/'Completato'. Vedi il piano Fase 3+4 per i
// dettagli e le decisioni sui dati mancanti (capacità/ore_stimate NULL -> fase istantanea).
export async function ricalcolaPiano(): Promise<RisultatoRicalcolo> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: repartiRows } = await client.query(
      `SELECT id, tipo_capacita, capacita_sett, n_risorse_parallele, wip_max, ordine_pipeline
       FROM reparti ORDER BY ordine_pipeline`
    );
    const reparti: Reparto[] = repartiRows.map((r) => ({
      id: r.id,
      tipoCapacita: r.tipo_capacita,
      capacitaSett: r.capacita_sett != null ? Number(r.capacita_sett) : null,
      nRisorseParallele: r.n_risorse_parallele != null ? Number(r.n_risorse_parallele) : null,
      wipMax: r.wip_max != null ? Number(r.wip_max) : null,
      ordinePipeline: Number(r.ordine_pipeline),
    }));

    // schede.stato e schede_fasi.stato_fase non sono sincronizzati (nessun ponte automatico,
    // per design): una scheda già segnata Completato/Annullata a mano ma con fasi rimaste
    // "Da iniziare" (mai toccate) non deve comunque essere pianificata attivamente — stessa
    // costante STATI_CHIUSI_ODP già usata altrove nel progetto per questo scopo.
    const { rows: fasiRows } = await client.query(
      `SELECT sf.id, sf.scheda_id, sf.reparto_id, sf.ordine, sf.ore_stimate, sf.data_disponibilita,
              sf.a_rischio, sf.corsia, sf.pianificazione_manuale,
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
      occupazionePerReparto.get(r.reparto_id)!.push({
        inizio: new Date(r.data_inizio_pianificata), fine: new Date(r.data_fine_pianificata), corsia: Number(r.corsia),
      });
    }

    const risultatiTotali = new Map<string, Risultato>();
    const oggi = primoGiornoLavorativoDa(toDate(oggiIso()));

    // Fasi pinnate manualmente (Fase 9, drag&drop) — seminate direttamente in risultatiTotali
    // con le date/corsia già in DB, PRIMA del loop a punto fisso: questo le esclude di suo dalla
    // coda di ripianificazione (il filtro `!risultatiTotali.has(f.id)` più sotto le salta già),
    // le rende visibili come occupazione corsia reale alle altre fasi dello stesso reparto, e fa
    // scattare la stessa propagazione data_disponibilita (4d) che riceverebbe una fase appena
    // calcolata — trattamento identico, solo che il risultato non lo calcola l'engine ma l'utente.
    for (const f of fasi.values()) {
      if (!f.pianificazioneManuale || !f.dataInizioEsistente || !f.dataFineEsistente) continue;
      risultatiTotali.set(f.id, { inizio: f.dataInizioEsistente, fine: f.dataFineEsistente, corsia: f.corsia });
      if (f.corsia != null) {
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

        const risultatiReparto = reparto.tipoCapacita === "corsie"
          ? pianificaCorsie(reparto, coda, occupazionePerReparto.get(reparto.id)!, oggi)
          : pianificaMonteOre(reparto, coda, oggi);

        for (const [faseId, res] of risultatiReparto) {
          risultatiTotali.set(faseId, res);
          const fase = fasi.get(faseId)!;
          const successiva = prossimaFase(fase);
          if (successiva) {
            successiva.dataDisponibilita = toIso(prossimoGiornoLavorativo(toDate(res.fine)));
          }
        }
      }
    }

    for (const [faseId, res] of risultatiTotali) {
      // Fasi pinnate: il risultato è esattamente ciò che già c'era in DB (seminato sopra),
      // riscriverlo toccherebbe solo aggiornato_il senza motivo.
      if (fasi.get(faseId)?.pianificazioneManuale) continue;
      await client.query(
        `UPDATE schede_fasi SET data_inizio_pianificata = $1, data_fine_pianificata = $2, corsia = $3, aggiornato_il = now() WHERE id = $4`,
        [res.inizio, res.fine, res.corsia, faseId]
      );
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
      await client.query(`UPDATE schede_fasi SET a_rischio = $1 WHERE id = $2`, [aRischio, ultima.id]);
      if (aRischio) {
        odpARischio++;
        if (!ultima.aRischioPrecedente) nuoviARischio.push({ schedaId: ultima.schedaId, odp: ultima.odp });
      }
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
