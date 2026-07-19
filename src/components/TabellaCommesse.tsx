"use client";

import { useState, useMemo } from "react";
import type { Commessa, Scheda } from "@/lib/types";
import BadgeStato from "./BadgeStato";
import DettaglioCommessaModal from "./DettaglioCommessaModal";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

function completamentoColor(pct: number): string {
  if (pct <= 20) return "#EF4444";
  if (pct <= 40) return "#F97316";
  if (pct <= 60) return "#F59E0B";
  if (pct <= 80) return "#84CC16";
  if (pct <= 90) return "#22C55E";
  return "#16A34A";
}

function MiniBar({ pct }: { pct: number }) {
  const color = completamentoColor(pct);
  return (
    <div className="flex items-center gap-2 min-w-24">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#e5e4e0" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs tabular-nums font-medium w-8 text-right" style={{ color }}>{pct}%</span>
    </div>
  );
}

export default function TabellaCommesse({ commesse, schede = [] }: { commesse: Commessa[]; schede?: Scheda[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const statiUniq = useMemo(
    () => Array.from(new Set(commesse.map((c) => c.stato).filter(Boolean))).sort(),
    [commesse]
  );

  const [filtroStati, setFiltroStati] = useState<Set<string>>(
    () => new Set(statiUniq.filter((s) => s !== "Chiusa"))
  );
  const [search, setSearch] = useState("");

  const completamentoMap = useMemo(() => {
    const m = new Map<string, { pct: number; total: number }>();
    const byCommessa = new Map<string, Scheda[]>();
    schede.forEach(s => {
      if (!s.commessaId) return;
      const arr = byCommessa.get(s.commessaId) ?? [];
      arr.push(s);
      byCommessa.set(s.commessaId, arr);
    });
    byCommessa.forEach((ss, id) => {
      const total = ss.length;
      const completati = ss.filter(s => s.statoProduzione === "Completato").length;
      m.set(id, { pct: Math.round((completati / total) * 100), total });
    });
    return m;
  }, [schede]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return commesse
      .filter((c) => {
        if (filtroStati.size > 0 && !filtroStati.has(c.stato)) return false;
        if (q && !`${c.numeroCommessa} ${c.cliente} ${c.localita}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => (a.dataCarico ?? "") < (b.dataCarico ?? "") ? -1 : 1);
  }, [commesse, filtroStati, search]);

  const inputCls = "border rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

  return (
    <div className="space-y-3">
      {/* Filtri */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          className={inputCls + " min-w-52"}
          placeholder="Cerca commessa, cliente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5 items-center">
          {statiUniq.map((s) => {
            const active = filtroStati.has(s);
            return (
              <button
                key={s}
                onClick={() => setFiltroStati((prev) => {
                  const next = new Set(prev);
                  active ? next.delete(s) : next.add(s);
                  return next;
                })}
                className="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
                style={{
                  background: active ? "var(--color-primary)" : "white",
                  color: active ? "white" : "var(--color-grey-mid)",
                  borderColor: active ? "var(--color-primary)" : "#d1d5db",
                }}
              >
                {s}
              </button>
            );
          })}
          {filtroStati.size !== statiUniq.length && (
            <button
              onClick={() => setFiltroStati(new Set(statiUniq))}
              className="text-xs px-2 py-1 rounded border"
              style={{ color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}
            >
              Mostra tutti
            </button>
          )}
        </div>
        <span className="ml-auto text-sm" style={{ color: "var(--color-grey-mid)" }}>
          {filtered.length} commesse
        </span>
      </div>

      {/* Tabella */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <th className="px-4 py-3">N° Commessa</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Località</th>
              <th className="px-4 py-3">Stato</th>
              <th className="px-4 py-3">Data Inizio Carichi</th>
              <th className="px-4 py-3">Inizio Mont.</th>
              <th className="px-4 py-3">Fine Mont.</th>
              <th className="px-4 py-3">Completamento</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessuna commessa trovata
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-orange-50/30 transition-colors">
                  <td className="px-4 py-3 font-semibold">{c.numeroCommessa || "—"}</td>
                  <td className="px-4 py-3">{c.cliente || "—"}</td>
                  <td className="px-4 py-3 text-xs">{c.localita || "—"}</td>
                  <td className="px-4 py-3"><BadgeStato stato={c.stato} /></td>
                  <td className="px-4 py-3 tabular-nums">{fmt(c.dataCarico)}</td>
                  <td className="px-4 py-3 tabular-nums">{fmt(c.inizioMontaggio)}</td>
                  <td className="px-4 py-3 tabular-nums">{fmt(c.fineMontaggio)}</td>
                  <td className="px-4 py-3">
                    {completamentoMap.has(c.id)
                      ? <MiniBar pct={completamentoMap.get(c.id)!.pct} />
                      : <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedId(c.id)}
                      className="text-xs px-2 py-1 rounded font-medium transition-colors"
                      style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)" }}
                    >
                      Dettaglio
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <DettaglioCommessaModal commessaId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
