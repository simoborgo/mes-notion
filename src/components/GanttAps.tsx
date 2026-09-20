"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { DatiGantt, FaseGantt, RepartoGantt } from "@/lib/apsGanttRepository";
import type { Scheda } from "@/lib/types";
import type { Role } from "@/lib/roles";
import { giornoLavorativoAps } from "@/lib/calendarioLavorativo";
import DettaglioSchedaModal from "./DettaglioSchedaModal";
import RicalcolaPianoApsButton from "./RicalcolaPianoApsButton";

const DAY_W = 62; // largo abbastanza da mostrare il numero ODP anche su una barra di un solo giorno
const LABEL_W = 210;
// Stesso stile del filtro date in Schede di Produzione (TabellaSchede.tsx)
const inputClsFiltro = "border rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

const PRIORITA: Record<string, { label: string; colore: string; peso: number }> = {
  critica: { label: "Critica", colore: "#A13A3A", peso: 4 },
  alta:    { label: "Alta",    colore: "#C2542E", peso: 3 },
  media:   { label: "Media",   colore: "#D9A62E", peso: 2 },
  bassa:   { label: "Bassa",   colore: "#8B8680", peso: 1 },
};

// Colori brillanti per stato — solo Vista CNC (ufficio programmazione): a differenza del resto
// dell'app, qui il colore primario della cella è lo stato della fase, non la priorità (che
// comunque conta poco quando la fase è già avviata) — priorità e rischio restano visibili nella
// coda dettagliata sotto la griglia.
const STATO_COLORE_CNC: Record<string, { bg: string; fg: string }> = {
  "Da iniziare": { bg: "#2563EB", fg: "#FFFFFF" },
  "In lavorazione": { bg: "#F97316", fg: "#FFFFFF" },
  "Completato": { bg: "#16A34A", fg: "#FFFFFF" },
};

// Le due corsie fisiche di CNC sono due macchine reali, non uno slot astratto — solo qui
// (Vista CNC), non nel Gantt completo condiviso con gli altri reparti a corsie.
const MACCHINE_CNC: Record<number, { nome: string; matricola: string }> = {
  0: { nome: "Rover B1", matricola: "10000 30501" },
  1: { nome: "Rover B2", matricola: "10000 59815" },
};
function nomeCorsiaCnc(corsia: number): string {
  return MACCHINE_CNC[corsia]?.nome ?? `Corsia ${corsia + 1}`;
}

function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(iso: string, n: number): string {
  const d = toDate(iso);
  const nuovo = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${nuovo.getFullYear()}-${p(nuovo.getMonth() + 1)}-${p(nuovo.getDate())}`;
}
function oggiIsoLocale(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function isWeekend(d: Date): boolean {
  const w = d.getDay();
  return w === 0 || w === 6;
}
function fmtGiorno(d: Date): { mese: string; giorno: number } {
  return { mese: d.toLocaleDateString("it-IT", { month: "short" }).toUpperCase(), giorno: d.getDate() };
}
function fmtDataOra(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function isoDaDate(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function lunedeDellaSettimana(d: Date): Date {
  const giorno = d.getDay(); // 0 = domenica … 6 = sabato
  const offset = giorno === 0 ? -6 : 1 - giorno;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
}
// Capacità oraria di una macchina in un giorno (turno × buffer) — stessa formula di
// capacitaOreCorsiaGiorno in apsSchedulerRepository.ts (server-only, non importabile qui): il
// buffer 0,85 è duplicato di proposito (BUFFER_CAPACITA), tenerli allineati.
const BUFFER_CAPACITA_CLIENT = 0.85;
function capacitaOreCorsiaClient(d: Date, oreStandard: { oreFeriale: number; oreSabato: number }): number {
  if (!giornoLavorativoAps(d)) return 0;
  return (d.getDay() === 6 ? oreStandard.oreSabato : oreStandard.oreFeriale) * BUFFER_CAPACITA_CLIENT;
}

// Peso-capacità di un giorno per la Vista CNC — stessa fonte (Impostazioni → Orari Turno,
// getOrariTurno/calcolaOreStandard) e stessa nozione di "giorno lavorativo" già usate dal motore
// APS vero (giornoLavorativoAps: sabato lavorativo, solo domenica e festivi esclusi) — non la
// versione "weekend" generica, che qui tratterebbe il sabato come chiuso mentre non lo è.
function pesoGiornoCnc(d: Date, oreStandard: { oreFeriale: number; oreSabato: number }): number {
  if (!giornoLavorativoAps(d)) return 0;
  return d.getDay() === 6 ? oreStandard.oreSabato : oreStandard.oreFeriale;
}

// Distribuisce le ore stimate di una fase sui giorni del suo intervallo pianificato,
// proporzionalmente al peso-capacità di ciascun giorno (stesso principio di capacitaGiornoReparto
// in apsSchedulerRepository.ts, qui solo per la previsione mostrata in Vista CNC — il motore di
// pianificazione vero resta a giornate intere, invariato).
function stimaPerGiornoIntervallo(daIso: string, aIso: string, oreStimate: number, oreStandard: { oreFeriale: number; oreSabato: number }): Map<string, number> {
  const pesi: { iso: string; peso: number }[] = [];
  let cur = toDate(daIso);
  const fine = toDate(aIso);
  while (cur <= fine) {
    pesi.push({ iso: isoDaDate(cur), peso: pesoGiornoCnc(cur, oreStandard) });
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  const sommaPesi = pesi.reduce((s, p) => s + p.peso, 0);
  const mappa = new Map<string, number>();
  if (sommaPesi <= 0) return mappa;
  for (const { iso, peso } of pesi) {
    if (peso > 0) mappa.set(iso, Math.round((oreStimate * peso / sommaPesi) * 10) / 10);
  }
  return mappa;
}

// Date effettive di una fase per il rendering: mai nascondere silenziosamente una barra per un
// dato mancante o storicamente inconsistente (es. una fase completata prima di una correzione
// precedente, con inizio pianificato rimasto successivo alla fine reale). Se manca una delle
// due si usa l'altra; se l'intervallo è invertito si collassa l'inizio sulla fine (la fine è il
// dato "reale" per una fase completata, l'inizio l'eventuale stima rimasta vecchia).
function dateEffettive(f: FaseGantt): { inizio: string; fine: string } | null {
  const inizio = f.dataInizioPianificata ?? f.dataFinePianificata;
  const fine = f.dataFinePianificata ?? f.dataInizioPianificata;
  if (!inizio || !fine) return null;
  return inizio > fine ? { inizio: fine, fine } : { inizio, fine };
}

// Impacchettamento "prima riga libera" — per i reparti a monte ore non esiste una corsia
// fisica reale (il vincolo vero è wip_max, letto dal gauge sopra): questa è solo una
// disposizione visiva per non sovrapporre barre di ODP diversi attivi insieme.
function impacchetta(fasi: FaseGantt[]): Map<string, number> {
  const conDate = fasi
    .map((f) => ({ f, date: dateEffettive(f) }))
    .filter((x): x is { f: FaseGantt; date: { inizio: string; fine: string } } => x.date !== null);
  const ordinate = conDate.sort((a, b) => a.date.inizio.localeCompare(b.date.inizio));
  const fineRiga: string[] = [];
  const rigaDiFase = new Map<string, number>();
  for (const { f, date } of ordinate) {
    let riga = fineRiga.findIndex((fine) => fine < date.inizio);
    if (riga === -1) { riga = fineRiga.length; fineRiga.push(date.fine); }
    else { fineRiga[riga] = date.fine; }
    rigaDiFase.set(f.id, riga);
  }
  return rigaDiFase;
}

function fmtRangeSettimana(daIso: string, aIso: string): string {
  const da = toDate(daIso), a = toDate(aIso);
  const meseA = a.toLocaleDateString("it-IT", { month: "long" });
  if (da.getMonth() === a.getMonth()) return `${da.getDate()} - ${a.getDate()} ${meseA} ${a.getFullYear()}`;
  const meseDa = da.toLocaleDateString("it-IT", { month: "short" });
  return `${da.getDate()} ${meseDa} - ${a.getDate()} ${meseA} ${a.getFullYear()}`;
}

interface OreCellaCnc { ore: number; operatori: string }

// Ore (ed eventuale operatore) da mostrare in una cella giorno×fase: reali se registrate quel
// giorno (da ore_registrate, vincono sempre sulla stima — mai in "Completato", dove una stima
// residua non avrebbe più senso), altrimenti la previsione già distribuita per fase in
// previsioniPerFase (vedi stimaPerGiornoIntervallo).
function oreDelGiorno(
  f: FaseGantt, giornoIso: string,
  oreMap: Map<string, Map<string, OreCellaCnc>>,
  previsioniPerFase: Map<string, Map<string, number>>
): { valore: number | null; reale: boolean; operatori: string } {
  const reale = oreMap.get(f.odp)?.get(giornoIso);
  if (reale != null) return { valore: reale.ore, reale: true, operatori: reale.operatori };
  if (f.statoFase === "Completato") return { valore: null, reale: false, operatori: "" };
  const stima = previsioniPerFase.get(f.id)?.get(giornoIso);
  return { valore: stima ?? null, reale: false, operatori: "" };
}

function KpiCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="rounded-lg px-4 py-2.5 flex items-center gap-3 border" style={{ background: "white", borderColor: "#e5e4e0" }}>
      <span className="text-2xl font-bold tabular-nums leading-none" style={{ color: accent }}>{value}</span>
      <span className="text-xs font-medium" style={{ color: "var(--color-grey-mid)" }}>{label}</span>
    </div>
  );
}

type Tab = "gantt" | "cnc";
const TABS: { value: Tab; label: string }[] = [
  { value: "gantt", label: "Gantt completo" },
  { value: "cnc", label: "CNC" },
];

export default function GanttAps({ dati, userRole, oreStandard }: { dati: DatiGantt; userRole?: Role; oreStandard: { oreFeriale: number; oreSabato: number } }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("gantt");
  const primoGiorno = dati.giorni[0];
  const ultimoGiorno = dati.giorni[dati.giorni.length - 1];
  // Filtro data: solo una vista ristretta lato client su dati già tutti caricati per l'intera
  // finestra. "Dal" parte sempre da oggi-3gg (non dall'inizio dell'intera finestra, che può
  // arrivare a 14+ giorni indietro) — clamp a primoGiorno per sicurezza, mai fuori dai dati
  // realmente caricati. "Al" resta l'intera finestra finché non si tocca.
  const [filtroDa, setFiltroDa] = useState(() => {
    const treGiorniFa = addDays(oggiIsoLocale(), -3);
    return treGiorniFa < primoGiorno ? primoGiorno : treGiorniFa;
  });
  const [filtroA, setFiltroA] = useState(ultimoGiorno);

  // Toast d'errore per il drag&drop (Fase 9) — stesso pattern già usato altrove (TabellaCarichi.tsx).
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  function onCambiato() { router.refresh(); }

  // Apertura Scheda dal Gantt — modal già esistente in Schede di Produzione, aperto già sulla
  // tab "Fasi APS": evita di duplicare la logica di visualizzazione/modifica in un modal nuovo.
  const [schedaAperta, setSchedaAperta] = useState<Scheda | null>(null);
  async function apriScheda(schedaId: string) {
    try {
      const res = await fetch(`/api/schede/${schedaId}`);
      if (res.ok) setSchedaAperta(await res.json());
    } catch {
      setToast("Errore nell'apertura della Scheda");
    }
  }

  const giorniIso = useMemo(
    () => dati.giorni.filter((g) => g >= filtroDa && g <= filtroA),
    [dati.giorni, filtroDa, filtroA]
  );
  const giorni = useMemo(() => giorniIso.map(toDate), [giorniIso]);
  const gridWidth = giorni.length * DAY_W;
  const oggi = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  function colonna(iso: string): number {
    return giorniIso.indexOf(iso);
  }

  const repartoCnc = useMemo(() => dati.reparti.find((r) => r.id === "cnc") ?? null, [dati.reparti]);

  return (
    <div className="space-y-5">
      {toast && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium border"
          style={{ background: "#FEF2F2", color: "#991B1B", borderColor: "#FECACA" }}
          role="alert"
        >
          <span className="text-base leading-none">⚠</span>
          {toast}
          <button onClick={() => setToast(null)} className="ml-auto text-base leading-none opacity-60 hover:opacity-100" aria-label="Chiudi">×</button>
        </div>
      )}

      {/* Tab — stesso stile pillola di PrevisionaleHub.tsx */}
      <div className="inline-flex gap-1 p-1 rounded-xl flex-wrap" style={{ background: "#F5F2EE" }}>
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className="px-5 py-2.5 text-base font-semibold rounded-lg transition-all"
            style={tab === t.value
              ? { background: "var(--color-primary)", color: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.18)" }
              : { background: "transparent", color: "var(--color-grey-mid)" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "gantt" && (
      <>
      {/* KPI di testata — sull'intero piano, non sulla sola finestra filtrata */}
      <div className="flex flex-wrap gap-3">
        <KpiCard label="Ore preventivate" value={dati.kpi.orePreventivateTotali} accent="var(--color-primary)" />
        <KpiCard label="Carico complessivo" value={dati.kpi.caricoComplessivoPct != null ? `${dati.kpi.caricoComplessivoPct}%` : "—"} accent="var(--color-black)" />
        <KpiCard label="ODP a rischio" value={dati.kpi.odpARischio} accent="#991B1B" />
        <KpiCard label="Reparti saturi (≥95%)" value={dati.kpi.repartiSaturi} accent="#C06A10" />
      </div>

      {/* Filtro data — stesso stile del filtro date in Schede di Produzione (TabellaSchede.tsx) */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Dal</label>
          <input type="date" className={inputClsFiltro} value={filtroDa} onChange={(e) => setFiltroDa(e.target.value || primoGiorno)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Al</label>
          <input type="date" className={inputClsFiltro} value={filtroA} onChange={(e) => setFiltroA(e.target.value || ultimoGiorno)} />
        </div>
        {(filtroDa !== primoGiorno || filtroA !== ultimoGiorno) && (
          <button
            onClick={() => { setFiltroDa(primoGiorno); setFiltroA(ultimoGiorno); }}
            className="text-xs px-2 py-1.5 rounded border font-medium hover:bg-gray-50 transition-colors"
            style={{ color: "var(--color-grey-mid)" }}
          >
            ✕ Azzera date
          </button>
        )}
        {userRole === "admin" && (
          <div className="ml-auto">
            <RicalcolaPianoApsButton compact onSuccess={onCambiato} />
          </div>
        )}
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-4 text-xs" style={{ color: "var(--color-grey-mid)" }}>
        {Object.values(PRIORITA).map((p) => (
          <span key={p.label} className="flex items-center gap-1.5">
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: p.colore, display: "inline-block" }} />
            {p.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span style={{ width: 16, height: 0, borderTop: "2px dashed #9c9894", display: "inline-block" }} />
          Pianificato automaticamente
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 16, height: 0, borderTop: "2px dashed #991B1B", display: "inline-block" }} />
          A rischio consegna
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 9, height: 9, borderRadius: 2, background: "#065F46", display: "inline-block" }} />
          Completata
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 16, height: 0, borderTop: "2px solid #6D28D9", display: "inline-block" }} />
          Pianificazione manuale — trascina una barra &ldquo;Da iniziare&rdquo; per fissarla
        </span>
      </div>

      {/* Timeline */}
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "#e5e4e0" }}>
        <div style={{ minWidth: LABEL_W + gridWidth }} className="p-4">
          {/* Riga date, condivisa da tutti i reparti */}
          <div className="flex">
            <div style={{ width: LABEL_W, flexShrink: 0 }} />
            <div className="flex">
              {giorni.map((d, i) => {
                const isOggi = d.getTime() === oggi.getTime();
                const { mese, giorno } = fmtGiorno(d);
                const primoDelMese = giorno === 1 || i === 0;
                return (
                  <div key={i} style={{ width: DAY_W, textAlign: "center", background: isOggi ? "var(--color-primary)" : isWeekend(d) ? "#EAE4D9" : "transparent", borderRadius: isOggi ? 4 : 0, padding: "3px 0" }}>
                    <div style={{ fontSize: 8, color: isOggi ? "white" : "var(--color-grey-icon)", visibility: primoDelMese ? "visible" : "hidden" }}>{mese}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: isOggi ? "white" : "var(--color-black)" }}>{giorno}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {dati.reparti.map((reparto) => (
            <RepartoSezione
              key={reparto.id} reparto={reparto} colonna={colonna} gridWidth={gridWidth}
              filtroDa={filtroDa} filtroA={filtroA} onCambiato={onCambiato} onErrore={setToast}
              onApriScheda={apriScheda}
            />
          ))}
        </div>
      </div>
      </>
      )}

      {tab === "cnc" && (
        repartoCnc
          ? <VistaCnc reparto={repartoCnc} userRole={userRole} oreStandard={oreStandard} onCambiato={onCambiato} onErrore={setToast} onApriScheda={apriScheda} />
          : <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Reparto CNC non trovato.</p>
      )}

      {schedaAperta && (
        <DettaglioSchedaModal
          scheda={schedaAperta}
          tabIniziale="aps"
          userRole={userRole}
          onClose={() => setSchedaAperta(null)}
          onSchedaAggiornata={() => { setSchedaAperta(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

// Vista dedicata a un solo reparto (per ora solo CNC, il "tamburo" principale) — griglia
// settimanale con le ore realmente lavorate ogni giorno (da ore_registrate, non solo
// l'intervallo pianificato come blocco unico) più una coda in forma di tabella, pensata per
// rispondere a "quando verrà lavorato in CNC l'ODP X" senza dover leggere le celle una per una.
// Sola lettura: niente drag&drop qui, quello resta nella vista Gantt completa.
function VistaCnc({ reparto, userRole, oreStandard, onCambiato, onErrore, onApriScheda }: {
  reparto: RepartoGantt; userRole?: Role; oreStandard: { oreFeriale: number; oreSabato: number };
  onCambiato: () => void; onErrore: (msg: string) => void; onApriScheda: (schedaId: string) => void;
}) {
  const [inizioSettimana, setInizioSettimana] = useState(() => isoDaDate(lunedeDellaSettimana(new Date())));
  // Settimana lavorativa Lun-Sab (6 giorni) — stessa nozione di "giorno lavorativo" della
  // configurazione Orari Turno (giornoLavorativoAps: sabato incluso, domenica mai lavorativa,
  // quindi mai mostrata come colonna).
  const fineSettimana = useMemo(() => addDays(inizioSettimana, 5), [inizioSettimana]);
  const giorniSettimana = useMemo(() => Array.from({ length: 6 }, (_, i) => addDays(inizioSettimana, i)), [inizioSettimana]);
  const oggiIso = useMemo(() => oggiIsoLocale(), []);
  const settimanaCorrente = inizioSettimana === isoDaDate(lunedeDellaSettimana(new Date()));

  // Ore reali lavorate su CNC (e chi le ha lavorate) per ODP e giorno, per la settimana
  // visualizzata — fetch dedicato (non nel payload principale della Pianificazione, che nessun'altra
  // vista usa) rilanciato ad ogni cambio settimana.
  const odps = useMemo(() => [...new Set(reparto.fasi.map((f) => f.odp))], [reparto.fasi]);
  const [oreMap, setOreMap] = useState<Map<string, Map<string, OreCellaCnc>>>(new Map());
  const [caricandoOre, setCaricandoOre] = useState(false);
  useEffect(() => {
    let annullato = false;
    setCaricandoOre(true);
    const params = new URLSearchParams({ odps: odps.join(","), da: inizioSettimana, a: fineSettimana });
    fetch(`/api/aps/cnc/ore-giornaliere?${params}`)
      .then((r) => r.json())
      .then((righe: { odp: string; data: string; ore: number; operatori: string }[]) => {
        if (annullato) return;
        const mappa = new Map<string, Map<string, OreCellaCnc>>();
        for (const r of righe) {
          if (!mappa.has(r.odp)) mappa.set(r.odp, new Map());
          mappa.get(r.odp)!.set(r.data, { ore: r.ore, operatori: r.operatori });
        }
        setOreMap(mappa);
      })
      .catch(() => { if (!annullato) onErrore("Errore nel caricamento delle ore CNC della settimana"); })
      .finally(() => { if (!annullato) setCaricandoOre(false); });
    return () => { annullato = true; };
  }, [odps, inizioSettimana, fineSettimana, onErrore]);

  // Previsione (ore stimate distribuite sui giorni pianificati, pesata per capacità reale del
  // giorno) precalcolata una volta per fase, non ad ogni cella — vedi stimaPerGiornoIntervallo.
  const previsioniPerFase = useMemo(() => {
    const mappa = new Map<string, Map<string, number>>();
    for (const f of reparto.fasi) {
      if (f.oreStimate == null) continue;
      const date = dateEffettive(f);
      if (!date) continue;
      mappa.set(f.id, stimaPerGiornoIntervallo(date.inizio, date.fine, f.oreStimate, oreStandard));
    }
    // Reparto a ore: la previsione è quella realmente allocata dal motore (turno × buffer, lavori
    // in sequenza), non la stima uniforme di sopra — che resta solo come ripiego per una fase
    // senza allocazioni (es. mai ricalcolata dopo l'attivazione del modello).
    if (reparto.modelloOre) {
      for (const f of reparto.fasi) {
        if (f.allocazioni.length > 0) mappa.set(f.id, new Map(f.allocazioni.map((a) => [a.giorno, a.ore])));
      }
    }
    return mappa;
  }, [reparto.fasi, reparto.modelloOre, oreStandard]);

  const nCorsie = reparto.nRisorseParallele ?? 1;
  const nRighe = Math.max(nCorsie, ...reparto.fasi.map((f) => (f.corsia ?? 0) + 1), 1);

  // Coda dettagliata: tutte le fasi CNC non completate, indipendentemente dalla settimana
  // visualizzata sopra — ordinata per corsia e poi data inizio, l'elenco pensato per ufficio
  // tecnico e falegnameria per sapere in che ordine reale gli ODP passeranno dal tamburo.
  const coda = useMemo(() => {
    return [...reparto.fasi]
      .filter((f) => dateEffettive(f) !== null && f.statoFase !== "Completato")
      .sort((a, b) => {
        const corsiaA = a.corsia ?? 99, corsiaB = b.corsia ?? 99;
        if (corsiaA !== corsiaB) return corsiaA - corsiaB;
        return dateEffettive(a)!.inizio.localeCompare(dateEffettive(b)!.inizio);
      });
  }, [reparto.fasi]);

  // Notifica di apertura (in-app, per ora niente canali esterni): fasi passate a "In lavorazione"
  // nelle ultime 48h, più recenti prima — l'unico modo oggi di sapere "cosa si è aperto e quando"
  // senza dover leggere una a una le barre della timeline sotto.
  const aperture = useMemo(() => {
    const sogliaMs = 48 * 3_600_000;
    const ora = new Date().getTime();
    return reparto.fasi
      .filter((f) => f.statoFase === "In lavorazione" && ora - new Date(f.aggiornatoIl).getTime() <= sogliaMs)
      .sort((a, b) => b.aggiornatoIl.localeCompare(a.aggiornatoIl));
  }, [reparto.fasi]);

  // Programmazione (Fase 9b) — coda ordinabile per macchina, non una vista a data: l'ufficio
  // programmazione decide solo macchina + posizione, le date restano sempre calcolate dal motore
  // (pianificaCorsie, apsSchedulerRepository.ts, che dà priorità a sequenza_manuale su
  // priorità/EDD automatici quando presente). Drag&drop nativo HTML5 tra colonne (dataTransfer
  // porta il solo faseId) per cambiare macchina; frecce su/giù per riordinare nella stessa coda.
  const [vista, setVista] = useState<"settimana" | "programmazione">("settimana");
  const [assegnando, setAssegnando] = useState<string | null>(null);

  // Non assegnati: fasi ancora sotto pieno controllo automatico (nessuna sequenza_manuale) —
  // l'ufficio programmazione non le ha ancora toccate, l'algoritmo le piazza per conto suo e
  // possono cambiare macchina da un ricalcolo all'altro. Ordinate come le calcola il motore
  // (proxy: data inizio pianificata) così l'ordine qui riflette quello che succederà davvero.
  const nonAssegnati = useMemo(() => {
    return reparto.fasi
      .filter((f) => f.statoFase === "Da iniziare" && f.sequenzaManuale == null)
      .sort((a, b) => (dateEffettive(a)?.inizio ?? "9999-99-99").localeCompare(dateEffettive(b)?.inizio ?? "9999-99-99"));
  }, [reparto.fasi]);

  // Coda manuale di una macchina: solo le fasi che l'ufficio programmazione ha esplicitamente
  // sequenziato lì (sequenza_manuale valorizzata) — le automatiche restano in "Non assegnati"
  // finché non vengono trascinate qui, non compaiono mai mescolate in questa colonna.
  function codaMacchina(corsia: number): FaseGantt[] {
    return reparto.fasi
      .filter((f) => f.statoFase === "Da iniziare" && f.corsia === corsia && f.sequenzaManuale != null)
      .sort((a, b) => a.sequenzaManuale! - b.sequenzaManuale!);
  }

  async function salvaCodaMacchina(corsia: number, faseIds: string[]) {
    setAssegnando(faseIds[faseIds.length - 1] ?? null);
    try {
      const res = await fetch(`/api/aps/cnc/coda-manuale`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corsia, faseIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        onErrore(body?.error ?? "Errore nell'aggiornamento della coda");
        return;
      }
      onCambiato();
    } catch {
      onErrore("Errore di connessione durante l'aggiornamento della coda");
    } finally {
      setAssegnando(null);
    }
  }

  // Sposta (o assegna per la prima volta, da "Non assegnati") una fase su una macchina — va in
  // fondo alla coda manuale di destinazione, dopo le altre già sequenziate lì. Nessun controllo
  // sulla corsia attuale: anche una fase che l'automatico ha già provvisoriamente messo lì va
  // comunque sequenziata quando la si trascina, altrimenti trascinarla da "Non assegnati" sulla
  // stessa macchina scelta per caso dall'algoritmo risulterebbe un no-op silenzioso.
  function spostaSuMacchina(faseId: string, corsiaTarget: number) {
    const f = reparto.fasi.find((x) => x.id === faseId);
    if (!f || f.statoFase !== "Da iniziare") return;
    const nuovaCoda = [...codaMacchina(corsiaTarget).map((x) => x.id), faseId];
    void salvaCodaMacchina(corsiaTarget, nuovaCoda);
  }

  // Riordina nella stessa coda scambiando con il vicino, poi rimanda l'intero ordine risultante.
  function spostaPosizione(corsia: number, faseId: string, direzione: -1 | 1) {
    const coda = codaMacchina(corsia).map((f) => f.id);
    const idx = coda.indexOf(faseId);
    const nuovoIdx = idx + direzione;
    if (idx < 0 || nuovoIdx < 0 || nuovoIdx >= coda.length) return;
    [coda[idx], coda[nuovoIdx]] = [coda[nuovoIdx], coda[idx]];
    void salvaCodaMacchina(corsia, coda);
  }

  // Rimette una fase manuale sotto controllo automatico — corsia inclusa, ricalcolata da zero.
  async function rimuoviManuale(faseId: string) {
    const f = reparto.fasi.find((x) => x.id === faseId);
    if (!f) return;
    setAssegnando(faseId);
    try {
      const res = await fetch(`/api/schede/${f.schedaId}/fasi/${f.id}/rimuovi-coda-manuale-cnc`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        onErrore(body?.error ?? "Errore nella rimozione dalla coda manuale");
        return;
      }
      onCambiato();
    } catch {
      onErrore("Errore di connessione durante la rimozione");
    } finally {
      setAssegnando(null);
    }
  }

  return (
    <div className="space-y-5">
      {aperture.length > 0 && (
        <div className="rounded-lg border p-3" style={{ borderColor: "#FBE9D2", background: "#FFFBF5" }}>
          <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-primary-dark)" }}>
            Aperture recenti (ultime 48h)
          </div>
          <div className="flex flex-wrap gap-2">
            {aperture.map((f) => (
              <button
                key={f.id} onClick={() => onApriScheda(f.schedaId)}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-full border hover:bg-orange-50"
                style={{ borderColor: "#FBE9D2", color: "var(--color-black)", background: "white" }}
              >
                {f.odp} <span style={{ color: "var(--color-grey-mid)", fontWeight: 400 }}>· {fmtDataOra(f.aggiornatoIl)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="inline-flex gap-1 p-1 rounded-lg" style={{ background: "#F5F2EE" }}>
        {(["settimana", "programmazione"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setVista(v)}
            className="px-3 py-1.5 text-xs font-semibold rounded-md transition-all"
            style={vista === v
              ? { background: "var(--color-primary)", color: "white" }
              : { background: "transparent", color: "var(--color-grey-mid)" }}
          >
            {v === "settimana" ? "Settimana" : "Programmazione"}
          </button>
        ))}
      </div>

      {vista === "settimana" && (
      <>
      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={() => setInizioSettimana(addDays(inizioSettimana, -7))}
          className="text-sm px-3 py-1.5 rounded-lg border font-medium hover:bg-gray-50 transition-colors"
          style={{ borderColor: "#d1d5db", color: "var(--color-black)" }}
        >
          ◀ Settimana precedente
        </button>
        <span className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>
          {fmtRangeSettimana(inizioSettimana, fineSettimana)}
        </span>
        <button
          onClick={() => setInizioSettimana(addDays(inizioSettimana, 7))}
          className="text-sm px-3 py-1.5 rounded-lg border font-medium hover:bg-gray-50 transition-colors"
          style={{ borderColor: "#d1d5db", color: "var(--color-black)" }}
        >
          Settimana successiva ▶
        </button>
        {!settimanaCorrente && (
          <button
            onClick={() => setInizioSettimana(isoDaDate(lunedeDellaSettimana(new Date())))}
            className="text-xs px-2 py-1.5 rounded border font-medium hover:bg-gray-50 transition-colors"
            style={{ color: "var(--color-grey-mid)" }}
          >
            ✕ Torna a oggi
          </button>
        )}
        {caricandoOre && <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Caricamento ore…</span>}
        {userRole === "admin" && (
          <div className="ml-auto">
            <RicalcolaPianoApsButton compact onSuccess={onCambiato} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-xs" style={{ color: "var(--color-grey-mid)" }}>
        {Object.entries(STATO_COLORE_CNC).map(([stato, c]) => (
          <span key={stato} className="flex items-center gap-1.5">
            <span style={{ width: 12, height: 12, borderRadius: 3, background: c.bg, display: "inline-block" }} />
            {stato}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span style={{ width: 12, height: 12, borderRadius: 3, border: "3px solid #DC2626", display: "inline-block" }} />
          A rischio consegna
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 12, height: 12, borderRadius: 3, border: "3px solid #7C3AED", display: "inline-block" }} />
          Pianificazione manuale
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 12, height: 12, borderRadius: 3, background: "#FCA5A5", display: "inline-block" }} />
          {reparto.modelloOre ? "Ore oltre la capacità della macchina — verifica" : "Più ODP sulla stessa corsia — verifica"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "#e5e4e0" }}>
        <table className="w-full text-sm" style={{ tableLayout: "fixed", minWidth: 780 }}>
          <thead>
            <tr>
              <th style={{ width: 90 }} />
              {giorniSettimana.map((g) => {
                const d = toDate(g);
                const isOggi = g === oggiIso;
                const nonLavorativo = !giornoLavorativoAps(d);
                return (
                  <th key={g} style={{ padding: "6px 4px", borderRadius: isOggi ? 6 : 0, background: isOggi ? "var(--color-primary)" : nonLavorativo ? "#EAE4D9" : "transparent" }}>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".05em", color: isOggi ? "white" : "var(--color-grey-icon)" }}>
                      {d.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "")}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isOggi ? "white" : "var(--color-black)" }}>{d.getDate()}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: nRighe }).map((_, riga) => {
              const overflow = riga >= nCorsie;
              return (
                <tr key={riga}>
                  <td
                    className="pr-2 text-right align-top" style={{ fontSize: 10, paddingTop: 8, color: overflow ? "#991B1B" : "var(--color-grey-icon)", fontWeight: overflow ? 700 : 400 }}
                    title={MACCHINE_CNC[riga] ? `Matricola ${MACCHINE_CNC[riga].matricola}` : undefined}
                  >
                    {overflow ? "⚠ " : ""}{nomeCorsiaCnc(riga)}
                  </td>
                  {giorniSettimana.map((g) => {
                    const fasiGiorno = reparto.fasi.filter((f) => f.corsia === riga && (() => {
                      const date = dateEffettive(f);
                      if (date == null || !(date.inizio <= g && g <= date.fine)) return false;
                      // Reparto a ore: una fase ancora da iniziare compare solo nei giorni in cui il
                      // motore le ha davvero allocato ore (nessuna barra continua sui giorni vuoti).
                      return !reparto.modelloOre || f.allocazioni.length === 0 || f.statoFase !== "Da iniziare"
                        || f.allocazioni.some((a) => a.giorno === g);
                    })()).sort((a, b) => (a.allocazioni.find((x) => x.giorno === g)?.ordineGiorno ?? 0) - (b.allocazioni.find((x) => x.giorno === g)?.ordineGiorno ?? 0));
                    const nonLavorativo = !giornoLavorativoAps(toDate(g));
                    // Con il modello a ore più lavori nello stesso giorno sono normali: si segnala solo
                    // se le ore allocate superano la capacità della macchina in quel giorno.
                    const oreAllocateCella = fasiGiorno.reduce((s, f) => s + (f.allocazioni.find((x) => x.giorno === g)?.ore ?? 0), 0);
                    const sovraccarico = reparto.modelloOre
                      ? oreAllocateCella > capacitaOreCorsiaClient(toDate(g), oreStandard) + 0.01
                      : fasiGiorno.length > 1;
                    return (
                      <td
                        key={g} className="align-top"
                        style={{
                          border: "1px solid #EBE9E5", height: 70, padding: 2,
                          background: sovraccarico ? "#FCA5A5" : nonLavorativo ? "#FBFAF8" : "white",
                        }}
                      >
                        {fasiGiorno.map((f) => {
                          const { valore, reale, operatori } = oreDelGiorno(f, g, oreMap, previsioniPerFase);
                          const stato = STATO_COLORE_CNC[f.statoFase] ?? STATO_COLORE_CNC["Da iniziare"];
                          const bordo = f.aRischio ? "3px solid #DC2626" : f.pianificazioneManuale ? "3px solid #7C3AED" : "3px solid transparent";
                          return (
                            <button
                              key={f.id} onClick={() => onApriScheda(f.schedaId)}
                              className="w-full text-left rounded-md mb-0.5 transition-transform hover:brightness-110"
                              style={{ background: stato.bg, border: bordo, padding: "3px 5px", boxShadow: "0 1px 2px rgba(26,25,24,0.2)" }}
                            >
                              <div style={{ fontSize: 9, fontWeight: 800, color: stato.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {f.odp}
                              </div>
                              {valore != null && (
                                <div style={{ fontSize: reale ? 13 : 10, fontWeight: reale ? 800 : 600, fontStyle: reale ? "normal" : "italic", color: reale ? stato.fg : "rgba(255,255,255,0.8)" }}>
                                  {valore}h{!reale && " prev."}
                                </div>
                              )}
                              {reale && operatori && (
                                <div style={{ fontSize: 8.5, fontWeight: 600, color: "rgba(255,255,255,0.92)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {operatori}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </>
      )}

      {vista === "programmazione" && (
        <VistaProgrammazioneCnc
          nCorsie={reparto.nRisorseParallele ?? 2} nonAssegnati={nonAssegnati} codaMacchina={codaMacchina} assegnando={assegnando}
          onSpostaSuMacchina={spostaSuMacchina} onSpostaPosizione={spostaPosizione}
          onRimuoviManuale={rimuoviManuale} onApriScheda={onApriScheda}
        />
      )}

      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "#e5e4e0" }}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase" style={{ background: "#faf9f7", color: "var(--color-grey-mid)" }}>
              <th className="px-4 py-2">Macchina</th>
              <th className="px-4 py-2">ODP</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Priorità</th>
              <th className="px-4 py-2">Ore stimate</th>
              <th className="px-4 py-2">Stato</th>
              <th className="px-4 py-2">Inizio</th>
              <th className="px-4 py-2">Fine</th>
            </tr>
          </thead>
          <tbody>
            {coda.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center" style={{ color: "var(--color-grey-mid)" }}>Nessun ODP in coda su CNC</td></tr>
            ) : coda.map((f) => {
              const p = PRIORITA[f.priorita] ?? PRIORITA.media;
              const date = dateEffettive(f)!;
              return (
                <tr
                  key={f.id} onClick={() => onApriScheda(f.schedaId)}
                  className="border-t cursor-pointer hover:bg-orange-50"
                  style={{ borderColor: "#f0efec", background: f.aRischio ? "#FFFBEB" : "transparent" }}
                >
                  <td className="px-4 py-2">{f.corsia != null ? nomeCorsiaCnc(f.corsia) : "—"}</td>
                  <td className="px-4 py-2 font-semibold">{f.odp}{f.sottoFase ? ` · ${f.sottoFase}` : ""}</td>
                  <td className="px-4 py-2">{f.clienteInfo || "—"}</td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-1.5">
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.colore, display: "inline-block" }} />
                      {p.label}
                    </span>
                  </td>
                  <td className="px-4 py-2 tabular-nums">{f.oreStimate != null ? `${f.oreStimate}h` : "—"}</td>
                  <td className="px-4 py-2">{f.statoFase}{f.aRischio ? " ⚠" : ""}</td>
                  <td className="px-4 py-2 tabular-nums">{toDate(date.inizio).toLocaleDateString("it-IT")}</td>
                  <td className="px-4 py-2 tabular-nums">{toDate(date.fine).toLocaleDateString("it-IT")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Programmazione (Fase 9b) — due colonne, una per macchina, ciascuna con la coda reale di quella
// corsia (manuali per primi nell'ordine scelto, poi gli automatici). Trascinare una carta da una
// colonna all'altra la riassegna (finisce in fondo alla nuova coda); le frecce riordinano nella
// stessa coda. Solo le fasi "Da iniziare" sono trascinabili/riordinabili — una già avviata non si
// può più ripiazzare. Le date mostrate sono quelle che il motore ha già calcolato per l'ordine
// corrente, non scelte qui.
function VistaProgrammazioneCnc({
  nCorsie, nonAssegnati, codaMacchina, assegnando, onSpostaSuMacchina, onSpostaPosizione, onRimuoviManuale, onApriScheda,
}: {
  nCorsie: number; nonAssegnati: FaseGantt[]; codaMacchina: (corsia: number) => FaseGantt[]; assegnando: string | null;
  onSpostaSuMacchina: (faseId: string, corsia: number) => void;
  onSpostaPosizione: (corsia: number, faseId: string, direzione: -1 | 1) => void;
  onRimuoviManuale: (faseId: string) => void; onApriScheda: (schedaId: string) => void;
}) {
  function onDropSuMacchina(e: ReactDragEvent<HTMLDivElement>, corsia: number) {
    e.preventDefault();
    const faseId = e.dataTransfer.getData("text/plain");
    if (faseId) onSpostaSuMacchina(faseId, corsia);
  }
  function onDropSuNonAssegnati(e: ReactDragEvent<HTMLDivElement>) {
    e.preventDefault();
    const faseId = e.dataTransfer.getData("text/plain");
    if (faseId) onRimuoviManuale(faseId);
  }

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${nCorsie + 1}, minmax(0, 1fr))` }}>
      <div
        onDragOver={(e) => e.preventDefault()} onDrop={onDropSuNonAssegnati}
        className="rounded-xl border p-3" style={{ borderColor: "#e5e4e0", background: "#faf9f7", minHeight: 420 }}
      >
        <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "var(--color-grey-mid)" }}>
          Non assegnati ({nonAssegnati.length})
        </div>
        <div className="space-y-2" style={{ maxHeight: 560, overflowY: "auto" }}>
          {nonAssegnati.length === 0 && (
            <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Tutto sequenziato a mano</p>
          )}
          {nonAssegnati.map((f) => (
            <CartaProgrammazioneCnc
              key={f.id} f={f} occupato={assegnando === f.id}
              onRimuoviManuale={() => onRimuoviManuale(f.id)} onApriScheda={onApriScheda}
            />
          ))}
        </div>
      </div>

      {Array.from({ length: nCorsie }).map((_, corsia) => {
        const coda = codaMacchina(corsia);
        return (
          <div
            key={corsia}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDropSuMacchina(e, corsia)}
            className="rounded-xl border p-3" style={{ borderColor: "#e5e4e0", minHeight: 420 }}
          >
            <div className="text-sm font-bold mb-3" style={{ color: "var(--color-black)" }} title={MACCHINE_CNC[corsia] ? `Matricola ${MACCHINE_CNC[corsia].matricola}` : undefined}>
              {nomeCorsiaCnc(corsia)} <span className="font-normal" style={{ color: "var(--color-grey-mid)" }}>({coda.length})</span>
            </div>
            <div className="space-y-2">
              {coda.length === 0 && (
                <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Nessun lavoro sequenziato</p>
              )}
              {coda.map((f, i) => (
                <CartaProgrammazioneCnc
                  key={f.id} f={f} occupato={assegnando === f.id}
                  suAbilitato={i > 0} giuAbilitato={i < coda.length - 1}
                  onSu={() => onSpostaPosizione(corsia, f.id, -1)} onGiu={() => onSpostaPosizione(corsia, f.id, 1)}
                  onRimuoviManuale={() => onRimuoviManuale(f.id)} onApriScheda={onApriScheda}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CartaProgrammazioneCnc({ f, occupato, suAbilitato, giuAbilitato, onSu, onGiu, onRimuoviManuale, onApriScheda }: {
  f: FaseGantt; occupato: boolean; suAbilitato?: boolean; giuAbilitato?: boolean;
  onSu?: () => void; onGiu?: () => void; onRimuoviManuale: () => void; onApriScheda: (schedaId: string) => void;
}) {
  const stato = STATO_COLORE_CNC[f.statoFase] ?? STATO_COLORE_CNC["Da iniziare"];
  const trascinabile = f.statoFase === "Da iniziare" && !occupato;
  const riordinabile = trascinabile && onSu != null && onGiu != null;
  const date = dateEffettive(f);
  const bordo = f.aRischio ? "3px solid #DC2626" : "3px solid transparent";
  const btnCls = "flex items-center justify-center rounded disabled:opacity-30";
  return (
    <div
      draggable={trascinabile}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", f.id)}
      className="rounded-lg transition-opacity flex items-start gap-2"
      style={{ background: stato.bg, border: bordo, padding: "8px 10px", boxShadow: "0 1px 3px rgba(26,25,24,0.25)", opacity: occupato ? 0.5 : 1 }}
    >
      {riordinabile && (
        <div className="flex flex-col gap-0.5 pt-0.5">
          <button type="button" onClick={onSu} disabled={!suAbilitato} className={btnCls} style={{ width: 18, height: 16, background: "rgba(255,255,255,0.25)", color: stato.fg, fontSize: 10 }} title="Sposta su">▲</button>
          <button type="button" onClick={onGiu} disabled={!giuAbilitato} className={btnCls} style={{ width: 18, height: 16, background: "rgba(255,255,255,0.25)", color: stato.fg, fontSize: 10 }} title="Sposta giù">▼</button>
        </div>
      )}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onApriScheda(f.schedaId)}>
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: 12, fontWeight: 800, color: stato.fg }}>{f.odp}</span>
          {f.sequenzaManuale != null && (
            <span style={{ fontSize: 8.5, fontWeight: 700, padding: "1px 5px", borderRadius: 8, background: "rgba(255,255,255,0.3)", color: stato.fg }}>MANUALE</span>
          )}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.85)" }}>{f.clienteInfo || "—"}</div>
        <div className="flex items-center justify-between mt-0.5">
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.85)" }}>{f.oreStimate != null ? `${f.oreStimate}h stimate` : "ore da stimare"}</span>
          {date && (
            <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.85)" }}>
              {toDate(date.inizio).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
              {" → "}
              {toDate(date.fine).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
            </span>
          )}
        </div>
      </div>
      {f.sequenzaManuale != null && (
        <button
          type="button" onClick={onRimuoviManuale} disabled={occupato}
          className="flex-shrink-0 text-xs disabled:opacity-30" style={{ color: "rgba(255,255,255,0.85)" }}
          title="Torna sotto controllo automatico"
        >
          ↺
        </button>
      )}
    </div>
  );
}

function RepartoSezione({ reparto, colonna, gridWidth, filtroDa, filtroA, onCambiato, onErrore, onApriScheda }: {
  reparto: RepartoGantt; colonna: (iso: string) => number; gridWidth: number;
  filtroDa: string; filtroA: string; onCambiato: () => void; onErrore: (msg: string) => void;
  onApriScheda: (schedaId: string) => void;
}) {
  const rigaMonteOre = useMemo(() => reparto.tipoCapacita === "monte_ore" ? impacchetta(reparto.fasi) : null, [reparto]);
  const caricoVisibile = useMemo(
    () => reparto.caricoGiornaliero.filter((c) => c.data >= filtroDa && c.data <= filtroA),
    [reparto.caricoGiornaliero, filtroDa, filtroA]
  );
  const nRighe = reparto.tipoCapacita === "corsie"
    ? Math.max(reparto.nRisorseParallele ?? 1, ...reparto.fasi.map((f) => (f.corsia ?? 0) + 1))
    : Math.max(1, ...(rigaMonteOre ? [...rigaMonteOre.values()].map((r) => r + 1) : [1]));

  return (
    <div className="mt-4">
      {/* Testata reparto: nome + badge */}
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-base font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--color-black)" }}>{reparto.nome}</h3>
        {reparto.tamburo && (
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: "#FBE9D2", color: "var(--color-primary-dark)" }}>
            Tamburo
          </span>
        )}
        {reparto.tbd && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#E4DED3", color: "var(--color-grey-mid)" }}>
            CAPACITÀ TBD
          </span>
        )}
        <span className="text-[11px]" style={{ color: "var(--color-grey-icon)" }}>
          {reparto.tipoCapacita === "corsie" ? `${reparto.nRisorseParallele ?? "—"} corsie` : `WIP max ${reparto.wipMax ?? "—"}`}
        </span>
      </div>

      {/* Modulo Carico */}
      <div className="flex mb-1">
        <div style={{ width: LABEL_W, flexShrink: 0, color: "var(--color-grey-icon)" }} className="text-[10px] pr-2 text-right self-center">Carico</div>
        <div className="flex" style={{ width: gridWidth }}>
          {caricoVisibile.map((c, i) => (
            <div
              key={i}
              title={c.percentuale != null ? `${c.percentuale}%` : "capacità da confermare"}
              style={{
                width: DAY_W, height: 8,
                background: c.percentuale == null ? "#E4DED3"
                  : c.percentuale >= 95 ? "#A13A3A"
                  : c.percentuale >= 70 ? "var(--color-primary)"
                  : c.percentuale > 0 ? "#D9A62E33"
                  : "transparent",
              }}
            />
          ))}
        </div>
      </div>

      {/* Modulo Sequenza */}
      <div className="flex">
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        <div style={{ position: "relative", width: gridWidth }}>
          {Array.from({ length: nRighe }).map((_, riga) => {
            // Overflow oltre n_risorse_parallele: vincolo fisico reale, evidenziato (spec sez. 6).
            const overflow = reparto.tipoCapacita === "corsie" && riga >= (reparto.nRisorseParallele ?? 1);
            return (
            <div key={riga} style={{ position: "relative", height: 46, borderBottom: "1px dashed #EBE9E5", background: overflow ? "#FEE2E233" : "transparent" }}>
              {reparto.tipoCapacita === "corsie" && (
                <span
                  style={{ position: "absolute", left: -LABEL_W, top: 14, width: LABEL_W - 8, textAlign: "right", fontSize: 10, paddingRight: 8, color: overflow ? "#991B1B" : "var(--color-grey-icon)", fontWeight: overflow ? 700 : 400 }}
                  title={overflow ? "Oltre le corsie fisiche disponibili" : undefined}
                >
                  {overflow ? "⚠ " : ""}Corsia {riga + 1}
                </span>
              )}
              {reparto.fasi
                .filter((f) => {
                  if (!dateEffettive(f)) return false;
                  const r = reparto.tipoCapacita === "corsie" ? f.corsia : rigaMonteOre?.get(f.id);
                  return r === riga;
                })
                .map((f) => (
                  <BarraFase
                    key={f.id} fase={f} repartoNome={reparto.nome} colonna={colonna} filtroDa={filtroDa} filtroA={filtroA}
                    onCambiato={onCambiato} onErrore={onErrore} onApriScheda={onApriScheda}
                  />
                ))}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BarraFase({ fase, repartoNome, colonna, filtroDa, filtroA, onCambiato, onErrore, onApriScheda }: {
  fase: FaseGantt; repartoNome: string; colonna: (iso: string) => number; filtroDa: string; filtroA: string;
  onCambiato: () => void; onErrore: (msg: string) => void; onApriScheda: (schedaId: string) => void;
}) {
  const [dragDeltaGiorni, setDragDeltaGiorni] = useState(0);
  const [trascinando, setTrascinando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // Un click che segue un vero trascinamento non deve anche aprire la Scheda — ref, non state:
  // deve essere già aggiornato in modo sincrono quando arriva l'evento "click" nativo dopo il
  // pointerup, non dopo un giro di render.
  const justDraggedRef = useRef(false);
  // Tooltip al passaggio del mouse — un portale su document.body (non un figlio della barra):
  // il contenitore del Gantt scorre orizzontalmente (overflow-x-auto), che per specifica CSS
  // rende "auto" anche l'overflow verticale — un tooltip figlio normale verrebbe tagliato non
  // appena sconfina dalla riga. position:fixed + coordinate reali del bounding rect aggirano
  // il problema del tutto.
  const barRef = useRef<HTMLDivElement>(null);
  const [hoverRect, setHoverRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const date = dateEffettive(fase);
  if (!date) return null;
  // Taglia (clamp) ai bordi della finestra filtrata invece di sparire del tutto: una fase
  // lunga che attraversa il filtro resta visibile, troncata ai bordi.
  const iniEff = date.inizio < filtroDa ? filtroDa : date.inizio;
  const fineEff = date.fine > filtroA ? filtroA : date.fine;
  if (iniEff > fineEff) return null; // completamente fuori dalla finestra filtrata
  const iniIdx = colonna(iniEff);
  const fineIdx = colonna(fineEff);
  if (iniIdx < 0 || fineIdx < 0) return null;
  const left = iniIdx * DAY_W + dragDeltaGiorni * DAY_W;
  const width = (Math.max(fineIdx - iniIdx, 0) + 1) * DAY_W - 4;
  const p = PRIORITA[fase.priorita] ?? PRIORITA.media;
  const completata = fase.statoFase === "Completato";
  const VERDE_COMPLETATA = "#065F46"; // stesso verde del badge "Completato" altrove nell'app (BadgeStato.tsx)
  const VIOLA_MANUALE = "#6D28D9";
  const pinnata = fase.pianificazioneManuale && fase.statoFase === "Da iniziare";
  // Trascinabile (Fase 9) solo se ancora "Da iniziare": una volta iniziata/completata la fase
  // esce dalla coda del motore comunque, spostarla non avrebbe più alcun effetto.
  const trascinabile = fase.statoFase === "Da iniziare" && !salvando;

  // Bordo: verde continuo se completata (sempre, ignora priorità/rischio — un dato reale e
  // chiuso), tratteggiato rosso se a rischio, viola continuo se pianificata a mano (Fase 9),
  // tratteggiato grigio se ancora solo pianificata dal motore ("Da iniziare" — provvisorio),
  // continuo altrimenti (In lavorazione — reale).
  const [bordoStile, bordoSpessore, bordoColore] = completata ? ["solid", 1, VERDE_COMPLETATA]
    : fase.aRischio ? ["dashed", 2, "#991B1B"]
    : pinnata ? ["solid", 2, VIOLA_MANUALE]
    : fase.statoFase === "Da iniziare" ? ["dashed", 1, "#9c9894"]
    : ["solid", 1, p.colore];

  async function commitSpostamento(deltaGiorni: number) {
    setSalvando(true);
    try {
      const res = await fetch(`/api/schede/${fase.schedaId}/fasi/${fase.id}/pianifica-manuale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataInizio: addDays(date!.inizio, deltaGiorni), dataFine: addDays(date!.fine, deltaGiorni) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        onErrore(body?.error ?? "Errore nello spostamento della fase");
        return;
      }
      onCambiato();
    } catch {
      onErrore("Errore di connessione durante lo spostamento");
    } finally {
      setSalvando(false);
      setDragDeltaGiorni(0);
    }
  }

  function iniziaTrascinamento(startX: number) {
    let ultimoDelta = 0;
    setTrascinando(true);
    function onMove(ev: PointerEvent) {
      ultimoDelta = Math.round((ev.clientX - startX) / DAY_W);
      setDragDeltaGiorni(ultimoDelta);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setTrascinando(false);
      if (ultimoDelta !== 0) {
        justDraggedRef.current = true;
        void commitSpostamento(ultimoDelta);
      } else {
        setDragDeltaGiorni(0);
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Click sulla barra apre la Scheda — sempre, anche su fasi non trascinabili (Completato/In
  // lavorazione); l'unica eccezione è il click "fantasma" che il browser genera dopo un vero
  // trascinamento (pointerup con scostamento diverso da zero).
  function onClickBarra() {
    if (justDraggedRef.current) { justDraggedRef.current = false; return; }
    onApriScheda(fase.schedaId);
  }

  async function sblocca() {
    setSalvando(true);
    try {
      const res = await fetch(`/api/schede/${fase.schedaId}/fasi/${fase.id}/sblocca-pianificazione`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        onErrore(body?.error ?? "Errore nello sblocco della pianificazione");
        return;
      }
      onCambiato();
    } catch {
      onErrore("Errore di connessione durante lo sblocco");
    } finally {
      setSalvando(false);
    }
  }

  function onEnter() {
    const r = barRef.current?.getBoundingClientRect();
    if (r) setHoverRect({ x: r.left, y: r.top, width: r.width, height: r.height });
  }
  function onLeave() { setHoverRect(null); }

  return (
    <>
    <div
      ref={barRef}
      onPointerDown={(e) => { if (!trascinabile) return; e.preventDefault(); iniziaTrascinamento(e.clientX); }}
      onClick={onClickBarra}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        position: "absolute", left, top: 3, width: Math.max(width, 10), height: 40,
        background: completata ? VERDE_COMPLETATA : p.colore,
        opacity: salvando ? 0.6 : 1,
        cursor: trascinabile ? (trascinando ? "grabbing" : "grab") : "pointer",
        border: `${bordoSpessore}px ${bordoStile} ${bordoColore}`,
        borderRadius: 4, display: "flex", alignItems: "center", paddingLeft: 4,
        boxShadow: "0 1px 2px rgba(26,25,24,0.15)", overflow: "hidden", userSelect: "none",
      }}
    >
      {width > 50 && (
        <span style={{ fontSize: 10, fontWeight: 700, color: "white", whiteSpace: "nowrap" }}>
          {fase.odp}{fase.sottoFase ? ` · ${fase.sottoFase}` : ""}
        </span>
      )}
      {pinnata && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={sblocca}
          disabled={salvando}
          title="Sblocca pianificazione manuale — torna a essere spostata dal motore"
          style={{
            position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: "50%",
            background: VIOLA_MANUALE, color: "white", fontSize: 11, lineHeight: "16px", textAlign: "center",
            border: "1px solid white", cursor: "pointer", padding: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
    {hoverRect && !trascinando && typeof document !== "undefined" && createPortal(
      <TooltipFase fase={fase} repartoNome={repartoNome} pinnata={pinnata} rect={hoverRect} />,
      document.body
    )}
    </>
  );
}

function TooltipFase({ fase, repartoNome, pinnata, rect }: {
  fase: FaseGantt; repartoNome: string; pinnata: boolean; rect: { x: number; y: number; width: number; height: number };
}) {
  const LARGHEZZA = fase.copertina ? 410 : 250;
  const sopra = rect.y > 200; // spazio sufficiente sopra la barra, altrimenti si apre sotto
  const left = Math.min(Math.max(rect.x, 8), (typeof window !== "undefined" ? window.innerWidth : 1200) - LARGHEZZA - 8);
  const top = sopra ? rect.y - 8 : rect.y + rect.height + 8;
  const p = PRIORITA[fase.priorita] ?? PRIORITA.media;

  return (
    <div
      style={{
        position: "fixed", left, top, width: LARGHEZZA, zIndex: 1000, pointerEvents: "none",
        transform: sopra ? "translateY(-100%)" : undefined,
        background: "white", border: "1px solid #e5e4e0", borderRadius: 10, padding: "10px 12px",
        boxShadow: "0 8px 24px rgba(26,25,24,0.22)", fontSize: 12, color: "var(--color-black)",
        display: "flex", gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{fase.odp}</div>
        <div style={{ color: "var(--color-grey-mid)", marginBottom: 6 }}>{fase.clienteInfo || "—"}</div>

        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
          <span style={{ color: "var(--color-grey-mid)" }}>Reparto</span>
          <span style={{ fontWeight: 600, textAlign: "right" }}>{repartoNome}{fase.sottoFase ? ` · ${fase.sottoFase}` : ""}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
          <span style={{ color: "var(--color-grey-mid)" }}>Stato</span>
          <span style={{ fontWeight: 600 }}>{fase.statoFase}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
          <span style={{ color: "var(--color-grey-mid)" }}>Priorità</span>
          <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: p.colore, display: "inline-block" }} />
            {p.label}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
          <span style={{ color: "var(--color-grey-mid)" }}>Ore stimate</span>
          <span style={{ fontWeight: 600 }}>{fase.oreStimate != null ? `${fase.oreStimate} h` : "da stimare"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
          <span style={{ color: "var(--color-grey-mid)" }}>Periodo</span>
          <span style={{ fontWeight: 600 }}>
            {fase.dataInizioPianificata ? new Date(fase.dataInizioPianificata).toLocaleDateString("it-IT") : "—"}
            {" → "}
            {fase.dataFinePianificata ? new Date(fase.dataFinePianificata).toLocaleDateString("it-IT") : "—"}
          </span>
        </div>

        {fase.aRischio && (
          <div style={{ marginTop: 6, padding: "3px 6px", borderRadius: 6, background: "#FEE2E2", color: "#991B1B", fontWeight: 600 }}>
            ⚠ A rischio consegna
          </div>
        )}
        {pinnata && (
          <div style={{ marginTop: 6, padding: "3px 6px", borderRadius: 6, background: "#EDE9FE", color: "#6D28D9", fontWeight: 600 }}>
            Pianificazione manuale
          </div>
        )}

        <div style={{ marginTop: 6, color: "var(--color-grey-icon)", fontSize: 10.5 }}>Clicca per aprire la Scheda</div>
      </div>
      {fase.copertina && (
        <img
          src={fase.copertina} alt=""
          style={{ width: 150, height: 150, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: "1px solid #e5e4e0" }}
        />
      )}
    </div>
  );
}
