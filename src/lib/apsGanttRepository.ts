import { pool, dateToStr } from "./db";
import { giornoLavorativoAps as giornoLavorativo } from "./calendarioLavorativo";
import { capacitaGiornoReparto } from "./apsSchedulerRepository";
import { getOrariTurno, calcolaOreStandard, type OrariTurno } from "./parametriGeneraliRepository";

function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addGiorni(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
export interface FaseGantt {
  id: string;
  schedaId: string;
  odp: string;
  clienteInfo: string;
  priorita: string;
  repartoId: string;
  sottoFase: string | null;
  oreStimate: number | null;
  statoFase: string;
  dataInizioPianificata: string | null;
  dataFinePianificata: string | null;
  corsia: number | null;
  aRischio: boolean;
  pianificazioneManuale: boolean;
}

export interface RepartoGantt {
  id: string;
  nome: string;
  tipoCapacita: "corsie" | "monte_ore";
  capacitaSett: number | null;
  nRisorseParallele: number | null;
  wipMax: number | null;
  tamburo: boolean;
  tbd: boolean;
  ordinePipeline: number;
  fasi: FaseGantt[];
  // percentuale = null quando non calcolabile (capacità TBD)
  caricoGiornaliero: { data: string; percentuale: number | null }[];
}

export interface KpiGantt {
  orePreventivateTotali: number;
  caricoComplessivoPct: number | null;
  odpARischio: number;
  repartiSaturi: number;
}

export interface DatiGantt {
  reparti: RepartoGantt[];
  giorni: string[];
  kpi: KpiGantt;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFase(r: any): FaseGantt {
  return {
    id: r.id,
    schedaId: r.scheda_id,
    odp: r.odp,
    clienteInfo: r.cliente_info ?? "",
    priorita: r.priorita,
    repartoId: r.reparto_id,
    sottoFase: r.sotto_fase,
    oreStimate: r.ore_stimate != null ? Number(r.ore_stimate) : null,
    statoFase: r.stato_fase,
    dataInizioPianificata: r.data_inizio_pianificata ? dateToStr(r.data_inizio_pianificata) : null,
    dataFinePianificata: r.data_fine_pianificata ? dateToStr(r.data_fine_pianificata) : null,
    corsia: r.corsia != null ? Number(r.corsia) : null,
    aRischio: r.a_rischio,
    pianificazioneManuale: r.pianificazione_manuale,
  };
}

// Carico giornaliero di un reparto a corsie: esatto, deriva direttamente dal campo `corsia`
// reale già assegnato dal motore — quante corsie sono occupate quel giorno / corsie totali.
function caricoCorsie(fasi: FaseGantt[], nRisorseParallele: number, giorni: Date[]): { data: string; percentuale: number | null }[] {
  return giorni.map((g) => {
    const occupate = new Set(
      fasi
        .filter((f) => f.dataInizioPianificata && f.dataFinePianificata && f.corsia != null
          && toDate(f.dataInizioPianificata) <= g && g <= toDate(f.dataFinePianificata))
        .map((f) => f.corsia)
    );
    return { data: dateToStr(g), percentuale: Math.round((occupate.size / nRisorseParallele) * 100) };
  });
}

// Carico giornaliero di un reparto a monte ore: approssimazione dichiarata — le ore_stimate di
// ogni fase si spalmano in parti uguali sui giorni lavorativi del suo intervallo pianificato,
// poi si sommano per giorno e si confrontano con la capacità giornaliera. Il motore (Fase 3+4)
// usa una quota pesata per priorità giorno per giorno, molto più fine: rifarla identica solo
// per un indicatore visivo non vale lo sforzo. Fasi con ore_stimate NULL non contribuiscono
// (nessun dato da spalmare — restano comunque visibili come barra nel Modulo Sequenza).
function caricoMonteOre(fasi: FaseGantt[], capacitaSett: number | null, giorni: Date[], ore: { oreFeriale: number; oreSabato: number }): { data: string; percentuale: number | null }[] {
  if (capacitaSett == null) return giorni.map((g) => ({ data: dateToStr(g), percentuale: null }));

  const orePerGiorno = new Map<string, number>();
  for (const f of fasi) {
    if (f.oreStimate == null || !f.dataInizioPianificata || !f.dataFinePianificata) continue;
    const inizio = toDate(f.dataInizioPianificata);
    const fine = toDate(f.dataFinePianificata);
    const giorniLavorativiFase: Date[] = [];
    for (let d = inizio; d <= fine; d = addGiorni(d, 1)) {
      if (giornoLavorativo(d)) giorniLavorativiFase.push(d);
    }
    const oreAlGiorno = f.oreStimate / Math.max(giorniLavorativiFase.length, 1);
    for (const d of giorniLavorativiFase) {
      const key = dateToStr(d);
      orePerGiorno.set(key, (orePerGiorno.get(key) ?? 0) + oreAlGiorno);
    }
  }

  return giorni.map((g) => {
    const key = dateToStr(g);
    const oreGiorno = orePerGiorno.get(key) ?? 0;
    const capacitaGiorno = capacitaGiornoReparto(capacitaSett, g, ore);
    if (capacitaGiorno <= 0) return { data: key, percentuale: oreGiorno > 0 ? 100 : 0 };
    return { data: key, percentuale: Math.round((oreGiorno / capacitaGiorno) * 100) };
  });
}

export async function getDatiGantt(): Promise<DatiGantt> {
  const orariTurno: OrariTurno = await getOrariTurno();
  const oreStandard = calcolaOreStandard(orariTurno);

  const { rows: repartiRows } = await pool.query(
    `SELECT id, nome, tipo_capacita, capacita_sett, n_risorse_parallele, wip_max, tamburo, tbd, ordine_pipeline
     FROM reparti ORDER BY ordine_pipeline`
  );

  const { rows: fasiRows } = await pool.query(
    `SELECT sf.id, sf.scheda_id, sf.reparto_id, sf.sotto_fase, sf.ore_stimate, sf.stato_fase,
            sf.data_inizio_pianificata, sf.data_fine_pianificata, sf.corsia, sf.a_rischio,
            sf.pianificazione_manuale,
            s.odp, s.priorita,
            CASE WHEN c.id IS NOT NULL THEN c.numero_commessa || ' ' || c.cliente ELSE '' END AS cliente_info
     FROM schede_fasi sf
     JOIN schede s ON s.id = sf.scheda_id
     LEFT JOIN commesse c ON c.id = s.commessa_id
     WHERE sf.stato_fase IN ('Da iniziare', 'In lavorazione', 'Completato')
       AND sf.esclusa = false AND s.archiviata = false
     ORDER BY sf.data_inizio_pianificata NULLS LAST`
  );
  const fasi = fasiRows.map(mapFase);

  // Finestra temporale condivisa da tutti i reparti (colonne allineate). Un orizzonte minimo
  // garantito (oggi-14gg / oggi+90gg) — non solo "fino alla fase più lontana mostrata" — perché
  // altrimenti, quando i dati attivi sono pochi (poche fasi, tutte vicine), la finestra si
  // restringe fino quasi a sparire: il filtro Da/A nella UI è solo client-side (nessuna nuova
  // richiesta al server), può restringere questa finestra ma mai allargarla oltre quello che
  // arriva già calcolato qui.
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  const ORIZZONTE_MINIMO_INDIETRO = 14;
  const ORIZZONTE_MINIMO_AVANTI = 90;
  const dateFine = fasi.map((f) => f.dataFinePianificata).filter((d): d is string => !!d).map(toDate);
  const massimoDati = dateFine.length > 0 ? new Date(Math.max(...dateFine.map((d) => d.getTime()))) : oggi;
  const massimo = massimoDati > addGiorni(oggi, ORIZZONTE_MINIMO_AVANTI) ? massimoDati : addGiorni(oggi, ORIZZONTE_MINIMO_AVANTI);
  const dateInizioCompletate = fasi.filter((f) => f.statoFase === "Completato" && f.dataInizioPianificata).map((f) => toDate(f.dataInizioPianificata!));
  const inizioMinimoDati = dateInizioCompletate.length > 0 ? new Date(Math.min(...dateInizioCompletate.map((d) => d.getTime()))) : oggi;
  const sogliaIndietro = addGiorni(oggi, -ORIZZONTE_MINIMO_INDIETRO);
  const inizioFinestra = inizioMinimoDati < sogliaIndietro ? inizioMinimoDati : sogliaIndietro;
  const fineFinestra = addGiorni(massimo, 7);
  const giorni: Date[] = [];
  for (let d = inizioFinestra; d <= fineFinestra; d = addGiorni(d, 1)) giorni.push(d);

  const reparti: RepartoGantt[] = repartiRows.map((r) => {
    const fasiReparto = fasi.filter((f) => f.repartoId === r.id);
    const capacitaSett = r.capacita_sett != null ? Number(r.capacita_sett) : null;
    const nRisorseParallele = r.n_risorse_parallele != null ? Number(r.n_risorse_parallele) : null;
    const caricoGiornaliero = r.tipo_capacita === "corsie"
      ? caricoCorsie(fasiReparto, nRisorseParallele ?? 1, giorni)
      : caricoMonteOre(fasiReparto, capacitaSett, giorni, oreStandard);
    return {
      id: r.id,
      nome: r.nome,
      tipoCapacita: r.tipo_capacita,
      capacitaSett,
      nRisorseParallele,
      wipMax: r.wip_max != null ? Number(r.wip_max) : null,
      tamburo: r.tamburo,
      tbd: r.tbd,
      ordinePipeline: Number(r.ordine_pipeline),
      fasi: fasiReparto,
      caricoGiornaliero,
    };
  });

  const orePreventivateTotali = fasi.reduce((s, f) => s + (f.oreStimate ?? 0), 0);
  const tuttiCarichi = reparti.flatMap((r) => r.caricoGiornaliero.map((c) => c.percentuale).filter((p): p is number => p != null));
  const caricoComplessivoPct = tuttiCarichi.length > 0
    ? Math.round(tuttiCarichi.reduce((s, p) => s + p, 0) / tuttiCarichi.length)
    : null;
  const odpARischio = new Set(fasi.filter((f) => f.aRischio).map((f) => f.schedaId)).size;
  const repartiSaturi = reparti.filter((r) => r.caricoGiornaliero.some((c) => c.percentuale != null && c.percentuale >= 95)).length;

  return {
    reparti,
    giorni: giorni.map(dateToStr),
    kpi: { orePreventivateTotali: Math.round(orePreventivateTotali * 10) / 10, caricoComplessivoPct, odpARischio, repartiSaturi },
  };
}
