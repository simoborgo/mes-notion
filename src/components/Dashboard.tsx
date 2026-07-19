"use client";

import { useMemo, useState } from "react";
import { Scheda, Ritiro, Commessa, Carico } from "@/lib/types";
import Link from "next/link";

const STATI_COMPLETATI = ["Completato", "Completata", "Chiusa", "Annullato"];
const STATO_COLOR: Record<string, string> = {
  "In produzione": "#F08F25",
  "In spedizione": "#3B82F6",
  "In montaggio":  "#10B981",
  "ShopDrawing":   "#8B5CF6",
};

function statoColor(s: string) { return STATO_COLOR[s] || "#A4A4A6"; }

function addDays(date: Date, n: number) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function diffDays(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86400000); }
function fmtShort(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}
function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  d.setHours(0, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

interface KpiCardProps { label: string; value: number; accent: string; bg: string; sublabel?: string; }

function KpiCard({ label, value, accent, bg, sublabel }: KpiCardProps) {
  return (
    <div className="rounded-lg px-4 py-3 flex items-center gap-3 border" style={{ background: bg, borderColor: accent + "33" }}>
      <span className="text-3xl font-bold tabular-nums leading-none shrink-0" style={{ color: accent, fontFamily: "ui-monospace, 'SF Mono', monospace", letterSpacing: "-0.02em" }}>{value}</span>
      <div>
        <div className="text-xs font-medium" style={{ color: "var(--color-grey-mid)" }}>{label}</div>
        {sublabel && <div className="text-xs mt-0.5" style={{ color: accent }}>{sublabel}</div>}
      </div>
    </div>
  );
}

interface CaricoMark { date: Date; titolo: string; }
interface GanttRow { commessa: Commessa; carichi: CaricoMark[]; montaggioStart: Date | null; montaggioEnd: Date | null; }

function GanttChart({ rows }: { rows: GanttRow[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const { viewStart, viewDays } = useMemo(() => {
    const dates = rows.flatMap(r => [...r.carichi.map(c => c.date), r.montaggioStart, r.montaggioEnd]).filter(Boolean) as Date[];
    if (!dates.length) return { viewStart: addDays(today, -14), viewDays: 90 };
    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));
    return { viewStart: addDays(min, -10), viewDays: Math.max(90, diffDays(min, max) + 20) };
  }, [rows, today]);

  const viewEnd = addDays(viewStart, viewDays);
  const todayPct = (diffDays(viewStart, today) / viewDays) * 100;
  const showToday = todayPct >= 0 && todayPct <= 100;

  function pct(d: Date | null): number | null {
    if (!d) return null;
    return (diffDays(viewStart, d) / viewDays) * 100;
  }

  // Month bands
  const bands = useMemo(() => {
    const result = [];
    let cur = new Date(viewStart.getFullYear(), viewStart.getMonth(), 1);
    while (cur < viewEnd) {
      const mEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
      const bS = cur < viewStart ? viewStart : cur;
      const bE = mEnd > viewEnd ? viewEnd : mEnd;
      result.push({
        label: cur.toLocaleDateString("it-IT", { month: "short", year: "2-digit" }).toUpperCase(),
        left: pct(bS)!,
        width: (diffDays(bS, addDays(bE, 1)) / viewDays) * 100,
        even: cur.getMonth() % 2 === 0,
      });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return result;
  }, [viewStart, viewEnd, viewDays]); // eslint-disable-line react-hooks/exhaustive-deps

  // Week lines
  const weekLines = useMemo(() => {
    const lines = [];
    for (let i = 0; i <= viewDays; i++) {
      const d = addDays(viewStart, i);
      if (d.getDay() === 1) lines.push({ p: (i / viewDays) * 100, d, monthStart: d.getDate() <= 7 });
    }
    return lines;
  }, [viewStart, viewDays]);

  function Bar({ start, end, color, fillColor }: { start: Date | null; end: Date | null; color: string; fillColor: string }) {
    const s = pct(start), e = pct(end);
    if (s === null || e === null) return null;
    const left = Math.max(0, Math.min(s, 100));
    const right = Math.max(0, Math.min(e, 100));
    if (right <= left + 0.1) return null;
    return (
      <div className="group" style={{ position: "absolute", left: `${left}%`, width: `${right - left}%`, height: "100%", borderRadius: 2, background: fillColor, border: `2px solid ${color}` }}>
        <div className="group-hover:opacity-100 opacity-0 pointer-events-none transition-opacity" style={{ position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", background: "#1a1714", color: "#fff", fontSize: 10, fontWeight: 600, padding: "3px 7px", borderRadius: 4, whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,.2)", zIndex: 10 }}>
          {start ? start.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : ""} → {end ? end.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : ""}
        </div>
      </div>
    );
  }

  function Dot({ date, color }: { date: Date | null; color: string }) {
    const p = pct(date);
    if (p === null || p < 0 || p > 100) return null;
    const label = date ? date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "";
    return (
      <div style={{ position: "absolute", top: "50%", left: `calc(${p}% - 7px)`, transform: "translateY(-50%)", zIndex: 4, display: "flex", alignItems: "center", gap: 2 }} className="group">
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: color, border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.25)", flexShrink: 0 }} />
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
          <path d="M1 5 L7 5 M5 2 L9 5 L5 8" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        <div className="group-hover:opacity-100 opacity-0 pointer-events-none transition-opacity" style={{ position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", background: "#1a1714", color: "#fff", fontSize: 10, fontWeight: 600, padding: "3px 7px", borderRadius: 4, whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,.2)" }}>
          {label}
        </div>
      </div>
    );
  }

  function DotCarico({ mark }: { mark: CaricoMark }) {
    const p = pct(mark.date);
    if (p === null || p < 0 || p > 100) return null;
    const label = `${mark.titolo} — ${mark.date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}`;
    return (
      <div style={{ position: "absolute", top: "50%", left: `calc(${p}% - 6px)`, transform: "translateY(-50%)", zIndex: 4 }} className="group">
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#F08F25", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.25)" }} />
        <div className="group-hover:opacity-100 opacity-0 pointer-events-none transition-opacity" style={{ position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", background: "#1a1714", color: "#fff", fontSize: 10, fontWeight: 600, padding: "3px 7px", borderRadius: 4, whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,.2)", zIndex: 10 }}>
          {label}
        </div>
      </div>
    );
  }

  function CaricoSpan({ carichi }: { carichi: CaricoMark[] }) {
    if (carichi.length < 2) return null;
    const first = carichi[0].date;
    const last = carichi[carichi.length - 1].date;
    const s = pct(first), e = pct(last);
    if (s === null || e === null) return null;
    const left = Math.max(0, Math.min(s, 100));
    const right = Math.max(0, Math.min(e, 100));
    if (right <= left) return null;
    return (
      <div style={{ position: "absolute", left: `${left}%`, width: `${right - left}%`, top: "50%", transform: "translateY(-50%)", height: 3, background: "rgba(240,143,37,0.35)", borderRadius: 2, zIndex: 2 }} />
    );
  }

  const ROW_H = 64;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header mesi */}
      <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ width: 260, minWidth: 260, flexShrink: 0, borderRight: "1px solid #e5e7eb" }} />
        <div style={{ flex: 1, position: "relative", height: 24, overflow: "hidden" }}>
          {bands.map((b, i) => (
            <div key={i} style={{ position: "absolute", left: `${b.left}%`, width: `${b.width}%`, height: "100%", background: b.even ? "rgba(240,143,37,.05)" : "transparent", borderRight: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", letterSpacing: ".07em", whiteSpace: "nowrap" }}>{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Header settimane */}
      <div style={{ display: "flex", borderBottom: "2px solid #e5e7eb" }}>
        <div style={{ width: 260, minWidth: 260, flexShrink: 0, borderRight: "1px solid #e5e7eb", padding: "3px 12px", display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em" }}>Commessa</span>
        </div>
        <div style={{ flex: 1, position: "relative", height: 18, overflow: "hidden" }}>
          {weekLines.map((w, i) => (
            <div key={i} style={{ position: "absolute", left: `${w.p}%`, top: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 1, height: 4, background: "#d1d5db" }} />
              <span style={{ fontSize: 8, color: "#9ca3af", whiteSpace: "nowrap" }}>{w.d.getDate()}/{w.d.getMonth() + 1}</span>
            </div>
          ))}
          {showToday && (
            <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 2, background: "#ef4444", zIndex: 10 }}>
              <span style={{ position: "absolute", top: 1, left: 4, fontSize: 9, fontWeight: 700, color: "#ef4444", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>OGGI</span>
            </div>
          )}
        </div>
      </div>

      {/* Righe */}
      {rows.map((r) => {
        const isSel = selected === r.commessa.id;
        const sc = statoColor(r.commessa.stato);
        const hasMontaggioRange = r.montaggioStart && r.montaggioEnd && diffDays(r.montaggioStart, r.montaggioEnd) > 0;

        return (
          <div key={r.commessa.id}
            onClick={() => setSelected(isSel ? null : r.commessa.id)}
            style={{ display: "flex", borderBottom: "1px solid #f3f4f6", background: isSel ? "rgba(240,143,37,.06)" : "#fff", cursor: "pointer", minHeight: ROW_H, transition: "background .1s" }}
          >
            {/* Label */}
            <div style={{ width: 260, minWidth: 260, flexShrink: 0, borderRight: "1px solid #e5e7eb", padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: "var(--color-black)" }}>{r.commessa.numeroCommessa}</span>
              </div>
              <div style={{ fontSize: 14, color: "#374151", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.commessa.cliente}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{r.commessa.localita}</div>
              {isSel && (
                <div style={{ marginTop: 6, fontSize: 10, color: "#9ca3af", lineHeight: 1.8, borderTop: "1px solid #f3f4f6", paddingTop: 4 }}>
                  <div>
                    Carichi: <strong style={{ color: "var(--color-black)" }}>
                      {r.carichi.length === 0 ? "—" : r.carichi.length === 1
                        ? fmtShort(r.carichi[0].date)
                        : `${fmtShort(r.carichi[0].date)} → ${fmtShort(r.carichi[r.carichi.length - 1].date)} (${r.carichi.length})`}
                    </strong>
                  </div>
                  {r.montaggioStart && <div>Montaggio: <strong style={{ color: "var(--color-black)" }}>{fmtShort(r.montaggioStart)} → {fmtShort(r.montaggioEnd)}</strong></div>}
                  <Link href={`/commesse/${r.commessa.id}`} className="underline" style={{ color: "var(--color-primary)" }}>Dettaglio →</Link>
                </div>
              )}
            </div>

            {/* Lane Gantt */}
            <div style={{ flex: 1, position: "relative", minHeight: ROW_H }}>
              {weekLines.map((w, i) => (
                <div key={i} style={{ position: "absolute", left: `${w.p}%`, top: 0, bottom: 0, width: 1, background: w.monthStart ? "#e5e7eb" : "#f9fafb" }} />
              ))}
              {showToday && <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 2, background: "#ef4444", opacity: 0.7, zIndex: 5 }} />}

              {/* Carichi */}
              <div style={{ position: "absolute", top: 8, left: 0, right: 0, height: 16, display: "flex", alignItems: "center" }}>
                <span style={{ position: "absolute", left: 4, fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#F08F25", opacity: .8, zIndex: 1 }}>Carico</span>
                <CaricoSpan carichi={r.carichi} />
                {r.carichi.map((c, i) => <DotCarico key={i} mark={c} />)}
              </div>

              {/* Montaggio */}
              <div style={{ position: "absolute", top: 28, left: 0, right: 0, height: 16, display: "flex", alignItems: "center" }}>
                <span style={{ position: "absolute", left: 4, fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#3B82F6", opacity: .8, zIndex: 1 }}>Montaggio</span>
                {hasMontaggioRange
                  ? <Bar start={r.montaggioStart} end={r.montaggioEnd} color="#3B82F6" fillColor="rgba(59,130,246,.15)" />
                  : <Dot date={r.montaggioStart} color="#3B82F6" />}
              </div>
            </div>
          </div>
        );
      })}

      {/* Legenda */}
      <div style={{ display: "flex", gap: 16, padding: "8px 12px", borderTop: "1px solid #f3f4f6", background: "#faf9f7", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#F08F25", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.2)" }} />
          <span style={{ fontSize: 10, color: "#6b7280" }}>Carico</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 20, height: 3, background: "rgba(240,143,37,0.35)", borderRadius: 2 }} />
          <span style={{ fontSize: 10, color: "#6b7280" }}>Span carichi</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 20, height: 10, background: "rgba(59,130,246,.15)", border: "2px solid #3B82F6", borderRadius: 2 }} />
          <span style={{ fontSize: 10, color: "#6b7280" }}>Finestra Montaggio</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 2, height: 14, background: "#ef4444" }} />
          <span style={{ fontSize: 10, color: "#6b7280" }}>Oggi</span>
        </div>
      </div>
    </div>
  );
}

interface DashboardProps { schede: Scheda[]; ritiri: Ritiro[]; commesse: Commessa[]; carichi: Carico[]; }

export default function Dashboard({ schede, ritiri, commesse, carichi }: DashboardProps) {
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  const oggiStr = oggi.toISOString().slice(0, 10);

  const meseStart = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
  const meseEnd = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0); meseEnd.setHours(23, 59, 59, 999);
  const meseStr = oggi.toLocaleDateString("it-IT", { month: "long" });

  const commesseInProduzione = commesse.filter((c) => c.stato === "In produzione").length;
  const commesseInSpedizioneMese = commesse.filter((c) => {
    if (!c.dataCarico) return false;
    const d = new Date(c.dataCarico);
    return d >= meseStart && d <= meseEnd;
  }).length;
  const commesseShopDrawing = commesse.filter((c) => c.stato === "ShopDrawing").length;
  const STATI_ESCLUSI_ODP = new Set(["Completato", "Materiale Pronto", "Annullato", "Da iniziare"]);
  const odpInLavorazione = schede.filter((s) => !STATI_ESCLUSI_ODP.has(s.statoProduzione)).length;

  const kpis: KpiCardProps[] = [
    { label: "Commesse in produzione", value: commesseInProduzione, accent: "#F08F25", bg: "#FFF7ED", sublabel: "attive" },
    { label: `In spedizione — ${meseStr}`, value: commesseInSpedizioneMese, accent: "#3B82F6", bg: "#EFF6FF", sublabel: "commesse questo mese" },
    { label: "Shop Drawing", value: commesseShopDrawing, accent: "#8B5CF6", bg: "#F5F3FF", sublabel: "in fase di progettazione" },
    { label: "ODP in lavorazione", value: odpInLavorazione, accent: "#059669", bg: "#ECFDF5", sublabel: "schede di produzione attive" },
  ];

  const carichiPerCommessa = useMemo(() => {
    const m = new Map<string, CaricoMark[]>();
    carichi.forEach(c => {
      if (!c.commessaId || !c.dataCarico) return;
      const d = parseDate(c.dataCarico);
      if (!d) return;
      const arr = m.get(c.commessaId) ?? [];
      arr.push({ date: d, titolo: c.titolo || "Carico" });
      m.set(c.commessaId, arr);
    });
    m.forEach(arr => arr.sort((a, b) => a.date.getTime() - b.date.getTime()));
    return m;
  }, [carichi]);

  const ganttRows: GanttRow[] = commesse
    .filter((c) => c.stato === "In produzione")
    .sort((a, b) => {
      const aC = carichiPerCommessa.get(a.id)?.[0]?.date?.toISOString() ?? a.dataCarico ?? "";
      const bC = carichiPerCommessa.get(b.id)?.[0]?.date?.toISOString() ?? b.dataCarico ?? "";
      return aC < bC ? -1 : 1;
    })
    .map((c) => ({
      commessa: c,
      carichi: carichiPerCommessa.get(c.id) ?? [],
      montaggioStart: parseDate(c.inizioMontaggio),
      montaggioEnd: parseDate(c.fineMontaggio),
    }));

  const commesseInMontaggio = commesse
    .filter((c) => c.stato === "In montaggio")
    .sort((a, b) => (a.inizioMontaggio ?? "") < (b.inizioMontaggio ?? "") ? -1 : 1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          {oggi.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          {" · "}aggiornato alle {new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Gantt */}
      {ganttRows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Pianificazione commesse
            </h2>
            <span className="text-xs px-2 py-0.5 rounded font-bold tracking-widest uppercase" style={{ background: "#F08F25", color: "#fff" }}>
              In produzione
            </span>
            <span className="text-xs ml-1" style={{ color: "var(--color-grey-mid)" }}>{ganttRows.length} commesse</span>
          </div>
          <div className="overflow-x-auto">
            <GanttChart rows={ganttRows} />
          </div>
        </div>
      )}

      {/* Commesse in montaggio */}
      {commesseInMontaggio.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3" style={{ background: "#faf9f7" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: "#10B981" }} />
            <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>Commesse in montaggio</h2>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#ECFDF5", color: "#059669" }}>
              {commesseInMontaggio.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide border-b" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
                  <th className="px-6 py-3">N° Commessa</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Località</th>
                  <th className="px-4 py-3">Inizio</th>
                  <th className="px-4 py-3">Fine</th>
                  <th className="px-4 py-3 text-right">Giorni</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {commesseInMontaggio.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-orange-50/30 transition-colors">
                    <td className="px-6 py-3 font-semibold">{c.numeroCommessa || "—"}</td>
                    <td className="px-4 py-3">{c.cliente || "—"}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{c.localita || "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{c.inizioMontaggio ? new Date(c.inizioMontaggio).toLocaleDateString("it-IT") : "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{c.fineMontaggio ? new Date(c.fineMontaggio).toLocaleDateString("it-IT") : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{c.giorniMontaggio ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Link href={`/commesse/${c.id}`} className="text-xs px-2 py-1 rounded font-medium" style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)" }}>
                        Dettaglio
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
