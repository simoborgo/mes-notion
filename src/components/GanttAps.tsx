"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { DatiGantt, FaseGantt, RepartoGantt } from "@/lib/apsGanttRepository";
import type { Scheda } from "@/lib/types";
import type { Role } from "@/lib/roles";
import DettaglioSchedaModal from "./DettaglioSchedaModal";

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

function KpiCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="rounded-lg px-4 py-2.5 flex items-center gap-3 border" style={{ background: "white", borderColor: "#e5e4e0" }}>
      <span className="text-2xl font-bold tabular-nums leading-none" style={{ color: accent }}>{value}</span>
      <span className="text-xs font-medium" style={{ color: "var(--color-grey-mid)" }}>{label}</span>
    </div>
  );
}

export default function GanttAps({ dati, userRole }: { dati: DatiGantt; userRole?: Role }) {
  const router = useRouter();
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
