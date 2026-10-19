"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Anagrafica, OdpKpi, EsternaKpi, OdpApertoKpi, RepartoOre } from "@/lib/kpiProduzioneRepository";

type Periodo = "30" | "90" | "365" | "tutto";

const PERIODI: { value: Periodo; label: string }[] = [
  { value: "30", label: "30 giorni" },
  { value: "90", label: "90 giorni" },
  { value: "365", label: "12 mesi" },
  { value: "tutto", label: "Tutto" },
];

const BORDO = "#E4E0DA";
const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

function fmtData(d: string | null) {
  if (!d) return "—";
  const [y, m, g] = d.split("-");
  return `${g}/${m}/${y}`;
}
const gg = (v: number) => `${num1.format(v)} gg`;
const segno = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
// Scarto con segno: + ritardo, − anticipo.
const ggSegno = (v: number) => (Math.abs(v) < 0.05 ? "in data" : `${segno(v)}${num1.format(Math.abs(v))} gg`);
const pctSegno = (v: number) => `${segno(v)}${num1.format(Math.abs(v))}%`;
const pct = (v: number) => `${num1.format(v)}%`;

// ── Statistiche e aggregazioni ───────────────────────────────────────────────

interface Stat<T> { min: T; max: T; medio: number; mediana: number; n: number }

function statistiche<T>(righe: T[], valore: (r: T) => number | null): Stat<T> | null {
  const conValore = righe.filter((r) => valore(r) != null);
  if (conValore.length === 0) return null;
  const ordinate = [...conValore].sort((a, b) => valore(a)! - valore(b)!);
  const valori = ordinate.map((r) => valore(r)!);
  const mid = Math.floor(valori.length / 2);
  return {
    min: ordinate[0],
    max: ordinate[ordinate.length - 1],
    medio: valori.reduce((s, v) => s + v, 0) / valori.length,
    mediana: valori.length % 2 ? valori[mid] : (valori[mid - 1] + valori[mid]) / 2,
    n: valori.length,
  };
}

// Larghezza di classe "tonda" (1/2/5 × 10^n) per un istogramma di ~nBins barre.
function passoTondo(max: number, nBins: number) {
  const grezzo = Math.max(max, 1) / nBins;
  const pot = Math.pow(10, Math.floor(Math.log10(grezzo)));
  const m = grezzo / pot;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * pot;
}

// Riga di dettaglio mostrata nel tooltip e nel popup di una barra: titolo = ODP · N° scheda,
// sotto = cod. articolo · cliente info, extra = il dato specifico del KPI.
interface Voce { titolo: string; sotto: string; extra?: string; valore: string }
interface Barra { etichetta: string; valore: number; tooltip: string; voci: Voce[] }

function istogramma<T>(items: T[], valore: (r: T) => number, voce: (r: T) => Voce, fmtEstremo: (v: number) => string, opzioni: { passo?: number; unitaN?: string } = {}): Barra[] {
  if (items.length === 0) return [];
  const { passo: passoFisso, unitaN = "ODP" } = opzioni;
  const valori = items.map(valore);
  const minV = Math.min(0, ...valori);
  const maxV = Math.max(0, ...valori);
  const passo = passoFisso ?? passoTondo(maxV - minV, 8);
  const base = Math.floor(minV / passo) * passo;
  const nBins = Math.floor((maxV - base) / passo) + 1;
  const gruppi: T[][] = Array.from({ length: nBins }, () => []);
  for (const r of items) gruppi[Math.floor((valore(r) - base) / passo)].push(r);
  return gruppi.map((g, i) => {
    const da = base + i * passo;
    const intervallo = passo === 1 ? fmtEstremo(da) : `${fmtEstremo(da)} – ${fmtEstremo(da + passo)}`;
    return { etichetta: fmtEstremo(da), valore: g.length, tooltip: `${intervallo}: ${g.length} ${unitaN}`, voci: [...g].sort((x, y) => valore(y) - valore(x)).map(voce) };
  });
}

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function mediaPerMese<T>(righe: T[], giorno: (r: T) => string, valore: (r: T) => number | null, voce: (r: T) => Voce, fmt: (v: number) => string, opzioni: { unitaN?: string; ordinaVoci?: (a: T, b: T) => number } = {}): Barra[] {
  const { unitaN = "ODP", ordinaVoci = (a, b) => valore(b)! - valore(a)! } = opzioni;
  const gruppi = new Map<string, T[]>();
  for (const r of righe) {
    if (valore(r) == null) continue;
    const mese = giorno(r).slice(0, 7);
    gruppi.set(mese, [...(gruppi.get(mese) ?? []), r]);
  }
  return [...gruppi.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mese, rs]) => {
    const media = rs.reduce((s, r) => s + valore(r)!, 0) / rs.length;
    const [y, m] = mese.split("-");
    const etichetta = `${MESI[Number(m) - 1]} ${y.slice(2)}`;
    return { etichetta, valore: media, tooltip: `${etichetta}: ${fmt(media)} (su ${rs.length} ${unitaN})`, voci: [...rs].sort(ordinaVoci).map(voce) };
  });
}

// ── Identificativi nei dettagli ──────────────────────────────────────────────

const idTitolo = (a: Anagrafica) => `${a.odp || "—"}${a.titolo ? ` · ${a.titolo}` : ""}`;
const idSotto = (a: Anagrafica) => `${a.codiceArticolo || "—"} · ${a.clienteInfo || "—"}`;
const voce = (a: Anagrafica, valore: string, extra?: string): Voce => ({ titolo: idTitolo(a), sotto: idSotto(a), extra, valore });
const campiBase = (a: Anagrafica): [string, string][] => [["ODP", a.odp], ["N° Scheda", a.titolo], ["Cod. Articolo", a.codiceArticolo], ["Cliente / Commessa", a.clienteInfo]];

const campiOdp = (r: OdpKpi): [string, string][] => [
  ...campiBase(r),
  ["Scheda ricevuta", fmtData(r.dataRicevuta)], ["Produzione prevista", fmtData(r.dataPrevista)], ["Prodotto il", fmtData(r.dataProduzione)],
  ["Lead Time", r.leadTimeGiorni != null ? `${r.leadTimeGiorni} gg` : "—"],
  ["Scarto di consegna", r.scartoGiorni != null ? ggSegno(r.scartoGiorni) : "—"],
  ["Attesa prima di iniziare", r.attesaGiorni != null ? `${r.attesaGiorni} gg` : "—"],
  ["Persone", r.persone > 0 ? String(r.persone) : "—"], ["Ore registrate", r.ore > 0 ? `${num1.format(r.ore)} h` : "—"],
  ["Costo", r.costo != null ? eur.format(r.costo) : "—"],
  ["Ore di rilavorazione (rif.)", r.oreRif > 0 ? `${num1.format(r.oreRif)} h` : "—"], ["Schede di rilavorazione", String(r.nRilavorazioni)],
  ["Ore stimate (reparti con stima)", r.oreStimate != null ? `${num1.format(r.oreStimate)} h` : "—"],
  ["Ore consuntivate (stessi reparti)", r.oreConsuntivateStimate != null ? `${num1.format(r.oreConsuntivateStimate)} h` : "—"],
  ["Scostamento", r.scostamentoPct != null ? pctSegno(r.scostamentoPct) : "—"],
];
const campiEsterna = (r: EsternaKpi): [string, string][] => [
  ...campiBase(r), ["Fornitore", r.fornitore],
  ["Uscita materiale", fmtData(r.dataUscita)], ["Rientro previsto", fmtData(r.dataRientroPrevista)], ["Rientro effettivo", fmtData(r.dataRientro)],
  ["Tempo di arrivo", r.giorni != null ? `${r.giorni} gg` : "—"], ["Scarto sul previsto", r.scartoGiorni != null ? ggSegno(r.scartoGiorni) : "—"],
];
const campiAperto = (r: OdpApertoKpi): [string, string][] => [
  ...campiBase(r), ["Stato", r.stato], ["Scheda ricevuta", fmtData(r.dataRicevuta)], ["Produzione prevista", fmtData(r.dataPrevista)],
  ["Età", r.etaGiorni != null ? `${r.etaGiorni} gg` : "—"], ["In ritardo", r.inRitardo ? "Sì" : "No"],
];

const voceLead = (r: OdpKpi) => voce(r, r.leadTimeGiorni != null ? `${r.leadTimeGiorni} gg` : "—", `${fmtData(r.dataRicevuta)} → ${fmtData(r.dataProduzione)}`);
const voceScarto = (r: OdpKpi) => voce(r, r.scartoGiorni != null ? ggSegno(r.scartoGiorni) : "—", `prevista ${fmtData(r.dataPrevista)} · prodotta ${fmtData(r.dataProduzione)}`);
const voceCosto = (r: OdpKpi) => voce(r, r.costo != null ? eur.format(r.costo) : "—", `${num1.format(r.ore)} h · ${r.persone} persone`);
const vocePersone = (r: OdpKpi) => voce(r, `${r.persone} persone`, `${num1.format(r.ore)} h registrate`);
const voceAttesa = (r: OdpKpi) => voce(r, r.attesaGiorni != null ? `${r.attesaGiorni} gg` : "—", `ricevuta ${fmtData(r.dataRicevuta)}`);
const voceScost = (r: OdpKpi) => voce(r, r.scostamentoPct != null ? pctSegno(r.scostamentoPct) : "—", `stimate ${num1.format(r.oreStimate ?? 0)} h · consuntivate ${num1.format(r.oreConsuntivateStimate ?? 0)} h`);
const voceRilav = (r: OdpKpi) => voce(r, `${num1.format(r.oreRif)} h`, `${r.nRilavorazioni} schede di rilavorazione`);
const voceEsterna = (r: EsternaKpi) => voce(r, r.giorni != null ? `${r.giorni} gg` : "—", `${r.fornitore || "fornitore n.d."} · ${fmtData(r.dataUscita)} → ${fmtData(r.dataRientro)}`);
const voceRientro = (r: EsternaKpi) => voce(r, r.scartoGiorni != null ? ggSegno(r.scartoGiorni) : "—", `${r.fornitore || "fornitore n.d."} · previsto ${fmtData(r.dataRientroPrevista)} · rientrato ${fmtData(r.dataRientro)}`);
const voceAperto = (r: OdpApertoKpi) => voce(r, r.etaGiorni != null ? `${r.etaGiorni} gg` : "—", `${r.stato} · prevista ${fmtData(r.dataPrevista)}${r.inRitardo ? " · IN RITARDO" : ""}`);

// ── Elementi grafici ─────────────────────────────────────────────────────────

// Contenuto del popup aperto con un clic su una barra, una scheda o una riga.
interface PopupDati { titolo: string; sottotitolo?: string; campi?: [string, string][]; voci?: Voce[] }
type Apri = (p: PopupDati) => void;

const VOCI_TOOLTIP = 5;

function Barre({ barre, fmtValore, vuoto, titolo, onApri }: {
  barre: Barra[]; fmtValore: (v: number) => string; vuoto: string; titolo: string; onApri: Apri;
}) {
  if (barre.length === 0) {
    return <div className="h-44 flex items-center justify-center text-sm" style={{ color: "var(--color-grey-mid)" }}>{vuoto}</div>;
  }
  const max = Math.max(...barre.map((b) => b.valore));
  const idxMax = barre.findIndex((b) => b.valore === max);
  const apri = (b: Barra) => onApri({ titolo, sottotitolo: b.tooltip, voci: b.voci });
  return (
    <div>
      <div className="flex items-end gap-[2px] h-44 pt-6">
        {barre.map((b, i) => {
          // Tooltip ancorato al bordo per le barre agli estremi, così non esce dal pannello.
          const pos = i < barre.length / 4 ? { left: 0 } : i > (barre.length * 3) / 4 ? { right: 0 } : { left: "50%", transform: "translateX(-50%)" };
          return (
            <div key={i} role="button" tabIndex={0} onClick={() => apri(b)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); apri(b); } }}
              className="group relative flex-1 h-full flex flex-col justify-end items-center min-w-0 cursor-pointer outline-none">
              {i === idxMax && (
                <span className="text-[11px] font-semibold tabular-nums mb-1 whitespace-nowrap" style={{ color: "var(--color-black)" }}>{fmtValore(b.valore)}</span>
              )}
              <div
                className="w-full transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80"
                style={{ height: `${Math.max((b.valore / max) * 100, b.valore > 0 ? 2 : 0)}%`, background: "var(--color-primary)", borderRadius: "4px 4px 0 0" }}
              />
              <div className="hidden group-hover:block group-focus-visible:block absolute bottom-full mb-1 z-10 px-3 py-2 rounded-lg text-xs pointer-events-none w-max max-w-[340px] shadow-lg"
                style={{ background: "var(--color-black)", color: "white", ...pos }}>
                <div className="font-semibold">{b.tooltip}</div>
                {b.voci.slice(0, VOCI_TOOLTIP).map((v, k) => (
                  <div key={k} className="flex justify-between gap-3 mt-1 opacity-90">
                    <span className="truncate">{v.titolo}</span><span className="tabular-nums shrink-0">{v.valore}</span>
                  </div>
                ))}
                <div className="mt-1.5 opacity-60">
                  {b.voci.length > VOCI_TOOLTIP ? `+ altri ${b.voci.length - VOCI_TOOLTIP} · ` : ""}clicca per il dettaglio
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-[2px] mt-1.5 border-t pt-1.5" style={{ borderColor: BORDO }}>
        {barre.map((b, i) => (
          <div key={i} className="flex-1 min-w-0 text-center text-[11px] tabular-nums truncate" title={b.etichetta} style={{ color: "var(--color-grey-mid)" }}>
            {barre.length <= 12 || i % Math.ceil(barre.length / 12) === 0 ? b.etichetta : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function Popup({ dati, onChiudi }: { dati: PopupDati; onChiudi: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onChiudi(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChiudi]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(26,25,24,0.45)" }} onClick={onChiudi}>
      <div role="dialog" aria-modal="true" aria-label={dati.titolo} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[80vh] flex flex-col rounded-xl shadow-2xl" style={{ background: "white" }}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b" style={{ borderColor: BORDO }}>
          <div className="min-w-0">
            <div className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>{dati.titolo}</div>
            {dati.sottotitolo && <div className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>{dati.sottotitolo}</div>}
          </div>
          <button onClick={onChiudi} aria-label="Chiudi" className="w-8 h-8 rounded-full hover:bg-black/5 shrink-0" style={{ color: "var(--color-grey-mid)" }}>✕</button>
        </div>
        <div className="overflow-y-auto px-5 py-3">
          {dati.campi && (
            <dl className="divide-y" style={{ borderColor: "#F0EDE8" }}>
              {dati.campi.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2 text-sm">
                  <dt className="shrink-0" style={{ color: "var(--color-grey-mid)" }}>{k}</dt>
                  <dd className="font-medium text-right tabular-nums">{v || "—"}</dd>
                </div>
              ))}
            </dl>
          )}
          {dati.voci && (dati.voci.length === 0 ? (
            <div className="py-6 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessun elemento.</div>
          ) : (
            <ul className="divide-y" style={{ borderColor: "#F0EDE8" }}>
              {dati.voci.map((v, i) => (
                <li key={i} className="flex justify-between gap-4 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate" title={v.titolo}>{v.titolo}</div>
                    <div className="text-xs truncate" style={{ color: "var(--color-grey-mid)" }} title={v.sotto}>{v.sotto}</div>
                    {v.extra && <div className="text-xs truncate" style={{ color: "var(--color-grey-mid)" }} title={v.extra}>{v.extra}</div>}
                  </div>
                  <div className="text-sm font-semibold tabular-nums shrink-0">{v.valore}</div>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}

function Pannello({ titolo, sotto, children }: { titolo: string; sotto?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ background: "white", border: `1px solid ${BORDO}` }}>
      <div className="mb-1">
        <div className="text-sm font-semibold">{titolo}</div>
        {sotto && <div className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{sotto}</div>}
      </div>
      {children}
    </div>
  );
}

function CardKpi({ etichetta, valore, dettaglio, evidenza, onClick }: { etichetta: string; valore: string; dettaglio: string; evidenza?: boolean; onClick?: () => void }) {
  return (
    <div className={`rounded-xl p-5 min-w-0 ${onClick ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`}
      onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      title={onClick ? "Clicca per il dettaglio" : undefined}
      style={{
        background: evidenza ? "var(--color-offwhite)" : "white",
        border: `1px solid ${evidenza ? "var(--color-primary)" : BORDO}`,
      }}>
      <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>{etichetta}</div>
      <div className="text-3xl font-semibold tabular-nums mt-1" style={{ fontFamily: "var(--font-display)" }}>{valore}</div>
      <div className="text-xs mt-1.5 truncate" style={{ color: "var(--color-grey-mid)" }} title={dettaglio}>{dettaglio}</div>
    </div>
  );
}

interface CardExtra { etichetta: string; valore: string; dettaglio: string; popup?: PopupDati }

function RigaKpi<T extends Anagrafica>({ titolo, unita, stat, valore, fmt, rif, campi, onApri, extra = [], unitaN = "ODP", etichette = ["Minimo", "Massimo"] }: {
  titolo: string; unita: string; stat: Stat<T> | null; valore: (r: T) => number; fmt: (v: number) => string; rif: (r: T) => string;
  campi: (r: T) => [string, string][]; onApri: Apri; extra?: CardExtra[]; unitaN?: string; etichette?: [string, string];
}) {
  const apri = (etichetta: string, r: T) => onApri({ titolo: `${titolo} — ${etichetta.toLowerCase()}`, sottotitolo: idTitolo(r), campi: campi(r) });
  const colonne = extra.length > 0 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3";
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>{titolo} <span className="text-sm font-normal" style={{ color: "var(--color-grey-mid)" }}>({unita})</span></h2>
      <div className={`grid grid-cols-1 ${colonne} gap-4`}>
        {stat ? (
          <>
            <CardKpi etichetta={etichette[0]} valore={fmt(valore(stat.min))} dettaglio={rif(stat.min)} onClick={() => apri(etichette[0], stat.min)} />
            <CardKpi etichetta="Medio" valore={fmt(stat.medio)} dettaglio={`su ${stat.n} ${unitaN} · mediana ${fmt(stat.mediana)}`} evidenza />
            <CardKpi etichetta={etichette[1]} valore={fmt(valore(stat.max))} dettaglio={rif(stat.max)} onClick={() => apri(etichette[1], stat.max)} />
          </>
        ) : (
          <div className="sm:col-span-3 rounded-xl p-5 text-sm" style={{ background: "white", border: `1px solid ${BORDO}`, color: "var(--color-grey-mid)" }}>
            Nessun dato sufficiente nel periodo selezionato.
          </div>
        )}
        {extra.map((e) => (
          <CardKpi key={e.etichetta} etichetta={e.etichetta} valore={e.valore} dettaglio={e.dettaglio} onClick={e.popup ? () => onApri(e.popup!) : undefined} />
        ))}
      </div>
    </section>
  );
}

function Sezione({ titolo }: { titolo: string }) {
  return <h2 className="text-lg font-semibold pt-2 border-t" style={{ fontFamily: "var(--font-display)", borderColor: BORDO }}>{titolo}</h2>;
}

interface RigaFornitore { fornitore: string; n: number; puntuali: number; ritardoMedio: number; ritardoMax: number; rientri: EsternaKpi[] }

type SortKey = "odp" | "titolo" | "codiceArticolo" | "clienteInfo" | "dataRicevuta" | "dataPrevista" | "dataProduzione" | "leadTimeGiorni" | "scartoGiorni" | "persone" | "ore" | "costo";

export default function DashboardKpiProduzione({ odp, esterne, aperti, oreReparto, costoOrario, periodo, dal }: {
  odp: OdpKpi[]; esterne: EsternaKpi[]; aperti: OdpApertoKpi[]; oreReparto: RepartoOre[]; costoOrario: number; periodo: Periodo; dal: string | null;
}) {
  const [popup, setPopup] = useState<PopupDati | null>(null);

  const righe = useMemo(() => (dal ? odp.filter((r) => r.dataProduzione >= dal) : odp), [odp, dal]);
  const righeEsterne = useMemo(() => (dal ? esterne.filter((r) => r.dataRientro >= dal) : esterne), [esterne, dal]);

  // Lead Time, costo, persone
  const lead = useMemo(() => statistiche(righe, (r) => r.leadTimeGiorni), [righe]);
  const costo = useMemo(() => statistiche(righe, (r) => r.costo), [righe]);
  const persone = useMemo(() => statistiche(righe, (r) => (r.persone > 0 ? r.persone : null)), [righe]);
  const senzaOre = righe.filter((r) => r.costo == null).length;
  const senzaData = righe.filter((r) => r.leadTimeGiorni == null).length;
  const distLead = useMemo(() => istogramma(righe.filter((r) => r.leadTimeGiorni != null), (r) => r.leadTimeGiorni!, voceLead, (v) => `${v}`), [righe]);
  const trendLead = useMemo(() => mediaPerMese(righe, (r) => r.dataProduzione, (r) => r.leadTimeGiorni, voceLead, gg), [righe]);
  const distCosto = useMemo(() => istogramma(righe.filter((r) => r.costo != null), (r) => r.costo!, voceCosto, (v) => eur.format(v)), [righe]);
  const trendCosto = useMemo(() => mediaPerMese(righe, (r) => r.dataProduzione, (r) => r.costo, voceCosto, (v) => eur.format(v)), [righe]);
  const distPersone = useMemo(() => istogramma(righe.filter((r) => r.persone > 0), (r) => r.persone, vocePersone, (v) => `${v}`, { passo: 1 }), [righe]);

  // Puntualità di consegna
  const conPrevista = useMemo(() => righe.filter((r) => r.scartoGiorni != null), [righe]);
  const scarto = useMemo(() => statistiche(conPrevista, (r) => r.scartoGiorni), [conPrevista]);
  const puntuali = conPrevista.filter((r) => r.scartoGiorni! <= 0).length;
  const inRitardo = useMemo(() => conPrevista.filter((r) => r.scartoGiorni! > 0).sort((a, b) => b.scartoGiorni! - a.scartoGiorni!), [conPrevista]);
  const distScarto = useMemo(() => istogramma(conPrevista, (r) => r.scartoGiorni!, voceScarto, (v) => `${v > 0 ? "+" : ""}${v}`), [conPrevista]);
  const trendPuntualita = useMemo(
    () => mediaPerMese(conPrevista, (r) => r.dataProduzione, (r) => (r.scartoGiorni! <= 0 ? 100 : 0), voceScarto, pct, { ordinaVoci: (a, b) => b.scartoGiorni! - a.scartoGiorni! }),
    [conPrevista],
  );

  // Attesa prima di iniziare
  const attesa = useMemo(() => statistiche(righe, (r) => r.attesaGiorni), [righe]);
  const distAttesa = useMemo(() => istogramma(righe.filter((r) => r.attesaGiorni != null), (r) => r.attesaGiorni!, voceAttesa, (v) => `${v}`), [righe]);

  // Ore stimate vs consuntive
  const conStima = useMemo(() => righe.filter((r) => r.scostamentoPct != null), [righe]);
  const scostamento = useMemo(() => statistiche(conStima, (r) => r.scostamentoPct), [conStima]);

  // Rilavorazioni
  const conRilav = useMemo(() => righe.filter((r) => r.nRilavorazioni > 0 || r.oreRif > 0), [righe]);
  const oreRilav = useMemo(() => statistiche(righe, (r) => (r.oreRif > 0 ? r.oreRif : null)), [righe]);

  // Fornitori
  const tempoEsterne = useMemo(() => statistiche(righeEsterne, (r) => r.giorni), [righeEsterne]);
  const distEsterne = useMemo(() => istogramma(righeEsterne.filter((r) => r.giorni != null), (r) => r.giorni!, voceEsterna, (v) => `${v}`, { unitaN: "lavorazioni" }), [righeEsterne]);
  const trendEsterne = useMemo(() => mediaPerMese(righeEsterne, (r) => r.dataRientro, (r) => r.giorni, voceEsterna, gg, { unitaN: "lavorazioni" }), [righeEsterne]);
  const rientriPrevisti = useMemo(() => righeEsterne.filter((r) => r.scartoGiorni != null), [righeEsterne]);
  const scartoRientro = useMemo(() => statistiche(rientriPrevisti, (r) => r.scartoGiorni), [rientriPrevisti]);
  const puntualiRientro = rientriPrevisti.filter((r) => r.scartoGiorni! <= 0).length;
  const ritardatariRientro = useMemo(() => rientriPrevisti.filter((r) => r.scartoGiorni! > 0).sort((a, b) => b.scartoGiorni! - a.scartoGiorni!), [rientriPrevisti]);
  const perFornitore = useMemo<RigaFornitore[]>(() => {
    const m = new Map<string, EsternaKpi[]>();
    for (const r of rientriPrevisti) {
      const chiave = r.fornitore || "Fornitore n.d.";
      m.set(chiave, [...(m.get(chiave) ?? []), r]);
    }
    return [...m.entries()].map(([fornitore, rientri]) => ({
      fornitore, rientri, n: rientri.length,
      puntuali: rientri.filter((r) => r.scartoGiorni! <= 0).length,
      ritardoMedio: rientri.reduce((s, r) => s + r.scartoGiorni!, 0) / rientri.length,
      ritardoMax: Math.max(...rientri.map((r) => r.scartoGiorni!)),
    })).sort((a, b) => b.n - a.n);
  }, [rientriPrevisti]);
  const barreFornitori = useMemo<Barra[]>(
    () => perFornitore.slice(0, 12).map((f) => ({
      etichetta: f.fornitore, valore: (f.puntuali / f.n) * 100,
      tooltip: `${f.fornitore}: ${pct((f.puntuali / f.n) * 100)} puntuali (${f.puntuali} su ${f.n}) · ritardo medio ${ggSegno(f.ritardoMedio)}`,
      voci: [...f.rientri].sort((a, b) => b.scartoGiorni! - a.scartoGiorni!).map(voceRientro),
    })),
    [perFornitore],
  );

  // Ore per reparto
  const oreTotReparto = oreReparto.reduce((s, r) => s + r.ore, 0);
  const barreReparto = useMemo<Barra[]>(
    () => oreReparto.map((r) => ({
      etichetta: r.reparto, valore: r.ore,
      tooltip: `${r.reparto}: ${num1.format(r.ore)} h (${pct(oreTotReparto > 0 ? (r.ore / oreTotReparto) * 100 : 0)})`,
      voci: r.odp.map((o) => voce(o, `${num1.format(o.ore)} h`)),
    })),
    [oreReparto, oreTotReparto],
  );

  // ODP aperti
  const etaAperti = useMemo(() => statistiche(aperti, (r) => r.etaGiorni), [aperti]);
  const apertiInRitardo = useMemo(() => aperti.filter((r) => r.inRitardo).sort((a, b) => (b.etaGiorni ?? 0) - (a.etaGiorni ?? 0)), [aperti]);
  const distAperti = useMemo(() => istogramma(aperti.filter((r) => r.etaGiorni != null), (r) => r.etaGiorni!, voceAperto, (v) => `${v}`), [aperti]);

  // Tabella dettaglio ODP
  const [sortKey, setSortKey] = useState<SortKey>("dataProduzione");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const ordinate = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...righe].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
  }, [righe, sortKey, sortDir]);

  function ordina(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "odp" || k === "titolo" || k === "codiceArticolo" || k === "clienteInfo" ? "asc" : "desc"); }
  }

  const th = (k: SortKey, label: string, right?: boolean) => (
    <th key={k} className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${right ? "text-right" : "text-left"}`}
      style={{ color: "#9c9894" }} onClick={() => ordina(k)}>
      {label}{sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );

  const colorScarto = (v: number | null) => (v == null ? undefined : v > 0 ? "#B91C1C" : "#15803D");

  return (
    <div className="space-y-8">
      {popup && <Popup dati={popup} onChiudi={() => setPopup(null)} />}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODI.map((p) => (
          <Link key={p.value} href={p.value === "tutto" ? "/schede/kpi-produzione" : `/schede/kpi-produzione?periodo=${p.value}`}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
            style={periodo === p.value
              ? { background: "var(--color-primary)", color: "white" }
              : { background: "white", color: "var(--color-grey-mid)", border: `1px solid ${BORDO}` }}>
            {p.label}
          </Link>
        ))}
        <span className="text-xs ml-2" style={{ color: "var(--color-grey-mid)" }}>{righe.length} ODP completati nel periodo</span>
      </div>

      {/* ── Tempi e consegne ── */}
      <Sezione titolo="Tempi e consegne" />
      <RigaKpi campi={campiOdp} onApri={setPopup} titolo="Lead Time" unita="dalla scheda ricevuta alla produzione effettiva" stat={lead} valore={(r) => r.leadTimeGiorni!} fmt={gg}
        rif={(r) => `${idTitolo(r)} · ${fmtData(r.dataRicevuta)} → ${fmtData(r.dataProduzione)}`} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Pannello titolo="Distribuzione Lead Time" sotto="Numero di ODP per classe di giorni">
          <Barre barre={distLead} titolo="Distribuzione Lead Time" onApri={setPopup} fmtValore={(v) => `${v} ODP`} vuoto="Nessun dato" />
        </Pannello>
        <Pannello titolo="Lead Time medio per mese" sotto="Mese di produzione effettiva">
          <Barre barre={trendLead} titolo="Lead Time medio per mese" onApri={setPopup} fmtValore={gg} vuoto="Nessun dato" />
        </Pannello>
      </div>

      <RigaKpi campi={campiOdp} onApri={setPopup} titolo="Puntualità di consegna" unita="produzione effettiva − prevista: + ritardo, − anticipo" stat={scarto} valore={(r) => r.scartoGiorni!} fmt={ggSegno}
        etichette={["Maggior anticipo", "Maggior ritardo"]}
        rif={(r) => `${idTitolo(r)} · prevista ${fmtData(r.dataPrevista)} · prodotta ${fmtData(r.dataProduzione)}`}
        extra={[{
          etichetta: "Puntuali", valore: conPrevista.length ? pct((puntuali / conPrevista.length) * 100) : "—",
          dettaglio: `${puntuali} su ${conPrevista.length} ODP in data o in anticipo · clicca per i ritardatari`,
          popup: { titolo: "ODP consegnati in ritardo", sottotitolo: `${inRitardo.length} su ${conPrevista.length}, dal ritardo maggiore`, voci: inRitardo.map(voceScarto) },
        }]} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Pannello titolo="Distribuzione scarto di consegna" sotto="Giorni di scarto: valori positivi = ritardo">
          <Barre barre={distScarto} titolo="Distribuzione scarto di consegna" onApri={setPopup} fmtValore={(v) => `${v} ODP`} vuoto="Nessun dato" />
        </Pannello>
        <Pannello titolo="ODP puntuali per mese" sotto="Percentuale di ODP prodotti in data o in anticipo">
          <Barre barre={trendPuntualita} titolo="ODP puntuali per mese" onApri={setPopup} fmtValore={pct} vuoto="Nessun dato" />
        </Pannello>
      </div>

      <RigaKpi campi={campiOdp} onApri={setPopup} titolo="Attesa prima di iniziare" unita="dalla scheda ricevuta alla prima ora registrata" stat={attesa} valore={(r) => r.attesaGiorni!} fmt={gg}
        rif={(r) => `${idTitolo(r)} · ricevuta ${fmtData(r.dataRicevuta)}`} />
      <Pannello titolo="Distribuzione attesa prima di iniziare" sotto="Numero di ODP per classe di giorni">
        <Barre barre={distAttesa} titolo="Distribuzione attesa prima di iniziare" onApri={setPopup} fmtValore={(v) => `${v} ODP`} vuoto="Nessun dato" />
      </Pannello>

      {/* ── Costi e risorse ── */}
      <Sezione titolo="Costi e risorse" />
      <RigaKpi campi={campiOdp} onApri={setPopup} titolo="Costo per ore" unita={`ore registrate × ${eur.format(costoOrario)}/h`} stat={costo} valore={(r) => r.costo!} fmt={(v) => eur.format(v)}
        rif={(r) => `${idTitolo(r)} · ${num1.format(r.ore)} h`} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Pannello titolo="Distribuzione Costo" sotto="Numero di ODP per classe di costo">
          <Barre barre={distCosto} titolo="Distribuzione Costo" onApri={setPopup} fmtValore={(v) => `${v} ODP`} vuoto="Nessun dato" />
        </Pannello>
        <Pannello titolo="Costo medio per mese" sotto="Mese di produzione effettiva">
          <Barre barre={trendCosto} titolo="Costo medio per mese" onApri={setPopup} fmtValore={(v) => eur.format(v)} vuoto="Nessun dato" />
        </Pannello>
      </div>

      <RigaKpi campi={campiOdp} onApri={setPopup} titolo="Persone per ODP" unita="operatori distinti con ore registrate" stat={persone} valore={(r) => r.persone} fmt={(v) => num1.format(v)}
        rif={(r) => `${idTitolo(r)} · ${num1.format(r.ore)} h`} />
      <Pannello titolo="Distribuzione persone per ODP" sotto="Numero di ODP per quantità di operatori coinvolti">
        <Barre barre={distPersone} titolo="Distribuzione persone per ODP" onApri={setPopup} fmtValore={(v) => `${v} ODP`} vuoto="Nessun dato" />
      </Pannello>

      <Pannello titolo="Ore per reparto" sotto={`Ore su commessa registrate nel periodo (${num1.format(oreTotReparto)} h totali) · clicca per gli ODP principali del reparto`}>
        <Barre barre={barreReparto} titolo="Ore per reparto" onApri={setPopup} fmtValore={(v) => `${num1.format(v)} h`} vuoto="Nessuna ora registrata nel periodo" />
      </Pannello>

      {/* ── Qualità e stime ── */}
      <Sezione titolo="Qualità e stime" />
      <RigaKpi campi={campiOdp} onApri={setPopup} titolo="Ore consuntive contro stimate" unita="scostamento % sui reparti con stima APS: + sforamento, − risparmio" stat={scostamento} valore={(r) => r.scostamentoPct!} fmt={pctSegno}
        etichette={["Maggior risparmio", "Maggior sforamento"]}
        rif={(r) => `${idTitolo(r)} · stimate ${num1.format(r.oreStimate ?? 0)} h · consuntivate ${num1.format(r.oreConsuntivateStimate ?? 0)} h`}
        extra={[{
          etichetta: "Copertura stima", valore: righe.length ? pct((conStima.length / righe.length) * 100) : "—",
          dettaglio: `${conStima.length} ODP su ${righe.length} hanno una stima · clicca per l'elenco`,
          popup: { titolo: "ODP con stima ore", sottotitolo: "Dal maggior sforamento", voci: [...conStima].sort((a, b) => b.scostamentoPct! - a.scostamentoPct!).map(voceScost) },
        }]} />

      <RigaKpi campi={campiOdp} onApri={setPopup} titolo="Rilavorazioni" unita="ore di rilavorazione (rif.) sugli ODP che ne hanno" stat={oreRilav} valore={(r) => r.oreRif} fmt={(v) => `${num1.format(v)} h`}
        rif={(r) => `${idTitolo(r)} · ${r.nRilavorazioni} schede di rilavorazione`}
        extra={[{
          etichetta: "ODP con rilavorazioni", valore: righe.length ? pct((conRilav.length / righe.length) * 100) : "—",
          dettaglio: `${conRilav.length} su ${righe.length} ODP · clicca per l'elenco`,
          popup: { titolo: "ODP con rilavorazioni", sottotitolo: "Schede di rilavorazione o ore marcate come rifacimento", voci: [...conRilav].sort((a, b) => b.oreRif - a.oreRif).map(voceRilav) },
        }]} />

      {/* ── Fornitori ── */}
      <Sezione titolo="Fornitori e lavorazioni esterne" />
      <RigaKpi campi={campiEsterna} onApri={setPopup} titolo="Tempo di arrivo dal fornitore" unita="dall'uscita del materiale al rientro effettivo" stat={tempoEsterne} valore={(r) => r.giorni!} fmt={gg} unitaN="lavorazioni"
        rif={(r) => `${idTitolo(r)} · ${r.fornitore || "fornitore n.d."} · ${fmtData(r.dataUscita)} → ${fmtData(r.dataRientro)}`} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Pannello titolo="Distribuzione tempi di rientro" sotto="Numero di lavorazioni esterne per classe di giorni">
          <Barre barre={distEsterne} titolo="Distribuzione tempi di rientro" onApri={setPopup} fmtValore={(v) => `${v} lav.`} vuoto="Nessun dato" />
        </Pannello>
        <Pannello titolo="Tempo di rientro medio per mese" sotto="Mese del rientro effettivo">
          <Barre barre={trendEsterne} titolo="Tempo di rientro medio per mese" onApri={setPopup} fmtValore={gg} vuoto="Nessun dato" />
        </Pannello>
      </div>

      <RigaKpi campi={campiEsterna} onApri={setPopup} titolo="Puntualità dei rientri" unita="rientro effettivo − previsto: + ritardo, − anticipo" stat={scartoRientro} valore={(r) => r.scartoGiorni!} fmt={ggSegno} unitaN="lavorazioni"
        etichette={["Maggior anticipo", "Maggior ritardo"]}
        rif={(r) => `${idTitolo(r)} · ${r.fornitore || "fornitore n.d."} · previsto ${fmtData(r.dataRientroPrevista)} · rientrato ${fmtData(r.dataRientro)}`}
        extra={[{
          etichetta: "Rientri puntuali", valore: rientriPrevisti.length ? pct((puntualiRientro / rientriPrevisti.length) * 100) : "—",
          dettaglio: `${puntualiRientro} su ${rientriPrevisti.length} · clicca per i ritardatari`,
          popup: { titolo: "Rientri in ritardo", sottotitolo: `${ritardatariRientro.length} su ${rientriPrevisti.length}, dal ritardo maggiore`, voci: ritardatariRientro.map(voceRientro) },
        }]} />
      <Pannello titolo="Puntualità per fornitore" sotto="Percentuale di rientri puntuali, primi 12 fornitori per numero di lavorazioni · clicca per le lavorazioni">
        <Barre barre={barreFornitori} titolo="Puntualità per fornitore" onApri={setPopup} fmtValore={pct} vuoto="Nessun rientro con data prevista nel periodo" />
        <div className="overflow-x-auto mt-4 -mx-5">
          <table className="w-full text-sm">
            <thead style={{ borderBottom: `1px solid ${BORDO}` }}>
              <tr>
                {["Fornitore", "Lavorazioni", "Puntuali", "Ritardo medio", "Ritardo max"].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap ${i === 0 ? "text-left" : "text-right"}`} style={{ color: "#9c9894" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perFornitore.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--color-grey-mid)" }}>Nessun rientro con data prevista nel periodo.</td></tr>
              )}
              {perFornitore.map((f) => (
                <tr key={f.fornitore} className="border-b last:border-0 cursor-pointer hover:bg-black/[0.03]" style={{ borderColor: "#F0EDE8" }}
                  onClick={() => setPopup({ titolo: f.fornitore, sottotitolo: `${f.n} rientri con data prevista`, voci: [...f.rientri].sort((a, b) => b.scartoGiorni! - a.scartoGiorni!).map(voceRientro) })}>
                  <td className="px-4 py-2 text-xs">{f.fornitore}</td>
                  <td className="px-4 py-2 tabular-nums text-right">{f.n}</td>
                  <td className="px-4 py-2 tabular-nums text-right">{pct((f.puntuali / f.n) * 100)}</td>
                  <td className="px-4 py-2 tabular-nums text-right font-semibold" style={{ color: colorScarto(f.ritardoMedio) }}>{ggSegno(f.ritardoMedio)}</td>
                  <td className="px-4 py-2 tabular-nums text-right" style={{ color: colorScarto(f.ritardoMax) }}>{ggSegno(f.ritardoMax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Pannello>

      {/* ── In corso ── */}
      <Sezione titolo="In corso adesso" />
      <RigaKpi campi={campiAperto} onApri={setPopup} titolo="ODP aperti" unita="età dalla scheda ricevuta, fotografia di oggi" stat={etaAperti} valore={(r) => r.etaGiorni!} fmt={gg}
        etichette={["Più recente", "Più vecchio"]}
        rif={(r) => `${idTitolo(r)} · ${r.stato} · ricevuta ${fmtData(r.dataRicevuta)}`}
        extra={[
          {
            etichetta: "ODP aperti", valore: String(aperti.length),
            dettaglio: `${apertiInRitardo.length} oltre la data prevista · clicca per quelli in ritardo`,
            popup: { titolo: "ODP aperti oltre la data prevista", sottotitolo: `${apertiInRitardo.length} su ${aperti.length}, dal più vecchio`, voci: apertiInRitardo.map(voceAperto) },
          },
        ]} />
      <Pannello titolo="Età degli ODP aperti" sotto="Numero di ODP per classe di giorni dalla scheda ricevuta (non filtrato per periodo)">
        <Barre barre={distAperti} titolo="Età degli ODP aperti" onApri={setPopup} fmtValore={(v) => `${v} ODP`} vuoto="Nessun ODP aperto" />
      </Pannello>

      <div className="text-xs space-y-1" style={{ color: "var(--color-grey-mid)" }}>
        <p>Sono conteggiati solo gli ODP (schede principali) con tutte le schede completate e la data di produzione effettiva valorizzata: i completamenti precedenti alla sua introduzione non sono inclusi. Fanno eccezione le sezioni &quot;Fornitori&quot; (periodo sul rientro effettivo), &quot;Ore per reparto&quot; (periodo sulla data delle ore) e &quot;In corso adesso&quot; (fotografia di oggi).</p>
        <p>Il costo usa il costo orario attuale dei Parametri Generali (non storicizzato) e include le ore delle rilavorazioni dell&apos;ODP.{senzaOre > 0 && ` ${senzaOre} ODP senza ore registrate sono esclusi dai KPI di costo.`}{senzaData > 0 && ` ${senzaData} ODP senza data scheda ricevuta sono esclusi dal Lead Time.`}</p>
        <p>L&apos;attesa prima di iniziare è la distanza tra scheda ricevuta e prima ora registrata sull&apos;ODP (minimo 0). Le ore stimate vengono dalle fasi APS, disponibili solo per gli ODP generati dopo l&apos;introduzione dello standard: confronto limitato ai reparti con stima.</p>
        <p>Tempo di arrivo e puntualità dei rientri dipendono da quanto puntualmente si compilano le date di uscita, rientro previsto e rientro effettivo delle lavorazioni esterne.</p>
      </div>

      <Pannello titolo="Dettaglio ODP" sotto="Clicca sulle intestazioni per ordinare, su una riga per il dettaglio completo">
        <div className="overflow-x-auto mt-3 -mx-5">
          <table className="w-full text-sm">
            <thead style={{ borderBottom: `1px solid ${BORDO}` }}>
              <tr>
                {th("odp", "ODP")}{th("titolo", "N° Scheda")}{th("codiceArticolo", "Cod. Articolo")}{th("clienteInfo", "Cliente / Commessa")}
                {th("dataRicevuta", "Ricevuta")}{th("dataPrevista", "Prevista")}{th("dataProduzione", "Prodotto il")}
                {th("leadTimeGiorni", "Lead Time", true)}{th("scartoGiorni", "Scarto", true)}
                {th("persone", "Persone", true)}{th("ore", "Ore", true)}{th("costo", "Costo", true)}
              </tr>
            </thead>
            <tbody>
              {ordinate.length === 0 && (
                <tr><td colSpan={12} className="px-4 py-8 text-center" style={{ color: "var(--color-grey-mid)" }}>Nessun ODP completato nel periodo.</td></tr>
              )}
              {ordinate.map((r) => (
                <tr key={r.odp} className="border-b last:border-0 cursor-pointer hover:bg-black/[0.03]" style={{ borderColor: "#F0EDE8" }}
                  onClick={() => setPopup({ titolo: `ODP ${r.odp}`, sottotitolo: r.titolo, campi: campiOdp(r) })}>
                  <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{r.odp}</td>
                  <td className="px-4 py-2 text-xs max-w-[200px] truncate" title={r.titolo}>{r.titolo || "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{r.codiceArticolo || "—"}</td>
                  <td className="px-4 py-2 text-xs max-w-[260px] truncate" title={r.clienteInfo}>{r.clienteInfo || "—"}</td>
                  <td className="px-4 py-2 tabular-nums whitespace-nowrap">{fmtData(r.dataRicevuta)}</td>
                  <td className="px-4 py-2 tabular-nums whitespace-nowrap">{fmtData(r.dataPrevista)}</td>
                  <td className="px-4 py-2 tabular-nums whitespace-nowrap">{fmtData(r.dataProduzione)}</td>
                  <td className="px-4 py-2 tabular-nums text-right whitespace-nowrap">{r.leadTimeGiorni != null ? `${r.leadTimeGiorni} gg` : "—"}</td>
                  <td className="px-4 py-2 tabular-nums text-right whitespace-nowrap font-semibold" style={{ color: colorScarto(r.scartoGiorni) }}>{r.scartoGiorni != null ? ggSegno(r.scartoGiorni) : "—"}</td>
                  <td className="px-4 py-2 tabular-nums text-right whitespace-nowrap">{r.persone > 0 ? r.persone : "—"}</td>
                  <td className="px-4 py-2 tabular-nums text-right whitespace-nowrap">{r.ore > 0 ? num1.format(r.ore) : "—"}</td>
                  <td className="px-4 py-2 tabular-nums text-right whitespace-nowrap">{r.costo != null ? eur.format(r.costo) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Pannello>

      <Pannello titolo="Dettaglio lavorazioni esterne" sotto="Rientri nel periodo, dal più recente · clicca su una riga per il dettaglio">
        <div className="overflow-x-auto mt-3 -mx-5">
          <table className="w-full text-sm">
            <thead style={{ borderBottom: `1px solid ${BORDO}` }}>
              <tr>
                {["ODP", "N° Scheda", "Cod. Articolo", "Cliente / Commessa", "Fornitore", "Uscita", "Rientro previsto", "Rientro effettivo", "Giorni", "Scarto"].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap ${i >= 8 ? "text-right" : "text-left"}`} style={{ color: "#9c9894" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {righeEsterne.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center" style={{ color: "var(--color-grey-mid)" }}>Nessuna lavorazione esterna rientrata nel periodo.</td></tr>
              )}
              {righeEsterne.map((r, i) => (
                <tr key={`${r.odp}-${r.titolo}-${i}`} className="border-b last:border-0 cursor-pointer hover:bg-black/[0.03]" style={{ borderColor: "#F0EDE8" }}
                  onClick={() => setPopup({ titolo: `Lavorazione esterna ${r.odp || ""}`.trim(), sottotitolo: r.titolo, campi: campiEsterna(r) })}>
                  <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{r.odp || "—"}</td>
                  <td className="px-4 py-2 text-xs max-w-[220px] truncate" title={r.titolo}>{r.titolo || "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{r.codiceArticolo || "—"}</td>
                  <td className="px-4 py-2 text-xs max-w-[240px] truncate" title={r.clienteInfo}>{r.clienteInfo || "—"}</td>
                  <td className="px-4 py-2 text-xs max-w-[200px] truncate" title={r.fornitore}>{r.fornitore || "—"}</td>
                  <td className="px-4 py-2 tabular-nums whitespace-nowrap">{fmtData(r.dataUscita)}</td>
                  <td className="px-4 py-2 tabular-nums whitespace-nowrap">{fmtData(r.dataRientroPrevista)}</td>
                  <td className="px-4 py-2 tabular-nums whitespace-nowrap">{fmtData(r.dataRientro)}</td>
                  <td className="px-4 py-2 tabular-nums text-right whitespace-nowrap">{r.giorni != null ? `${r.giorni} gg` : "—"}</td>
                  <td className="px-4 py-2 tabular-nums text-right whitespace-nowrap font-semibold" style={{ color: colorScarto(r.scartoGiorni) }}>{r.scartoGiorni != null ? ggSegno(r.scartoGiorni) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Pannello>
    </div>
  );
}
