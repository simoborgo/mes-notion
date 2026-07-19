"use client";

import { useState, useMemo } from "react";
import type { Carico, Commessa } from "@/lib/types";
import BadgeStato from "./BadgeStato";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

interface Props {
  carichi: Carico[];
  commesse: Commessa[];
}

export default function TabellaCarichi({ carichi, commesse }: Props) {
  const commessaMap = useMemo(() => {
    const m = new Map<string, Commessa>();
    commesse.forEach(c => m.set(c.id, c));
    return m;
  }, [commesse]);

  const stati = useMemo(() => [...new Set(carichi.map(c => c.stato).filter(Boolean))].sort(), [carichi]);
  const [filtroStati, setFiltroStati] = useState<Set<string>>(
    () => new Set(stati.filter(s => s !== "Spedito"))
  );
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string>("dataCarico");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const rows = carichi
      .filter(c => filtroStati.size === 0 || filtroStati.has(c.stato))
      .filter(c => {
        if (!q) return true;
        const commessa = commessaMap.get(c.commessaId ?? "");
        return `${c.titolo} ${commessa?.numeroCommessa ?? ""} ${commessa?.cliente ?? ""}`.toLowerCase().includes(q);
      });

    rows.sort((a, b) => {
      let va = "", vb = "";
      if (sortCol === "dataCarico") { va = a.dataCarico ?? ""; vb = b.dataCarico ?? ""; }
      else if (sortCol === "titolo") { va = a.titolo; vb = b.titolo; }
      else if (sortCol === "commessa") {
        va = commessaMap.get(a.commessaId ?? "")?.numeroCommessa ?? "";
        vb = commessaMap.get(b.commessaId ?? "")?.numeroCommessa ?? "";
      }
      else if (sortCol === "modalita") { va = a.modalita; vb = b.modalita; }
      else if (sortCol === "stato") { va = a.stato; vb = b.stato; }
      else if (sortCol === "odp") { va = String(a.odpIds.length); vb = String(b.odpIds.length); }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [carichi, filtroStati, search, commessaMap, sortCol, sortDir]);

  function SortIcon({ col }: { col: string }) {
    if (sortCol !== col) return <span style={{ opacity: 0.3 }}>↕</span>;
    return <span>{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function Th({ col, label, className }: { col: string; label: string; className?: string }) {
    return (
      <th
        className={`px-4 py-3 cursor-pointer select-none hover:text-orange-500 transition-colors ${className ?? ""}`}
        onClick={() => toggleSort(col)}
      >
        <span className="inline-flex items-center gap-1">{label} <SortIcon col={col} /></span>
      </th>
    );
  }

  const inputCls = "border rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";
  const chipBase = "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors";

  return (
    <div className="space-y-3">
      {/* Filtri */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          className={inputCls + " min-w-52"}
          placeholder="Cerca titolo, commessa, cliente…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Filtro stato — multi-select */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Stato:</span>
          {stati.map(s => {
            const active = filtroStati.has(s);
            return (
              <button
                key={s}
                onClick={() => setFiltroStati(prev => {
                  const next = new Set(prev);
                  active ? next.delete(s) : next.add(s);
                  return next;
                })}
                className={chipBase}
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
          {filtroStati.size !== stati.length && (
            <button
              onClick={() => setFiltroStati(new Set(stati))}
              className="text-xs px-2 py-1 rounded border"
              style={{ color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}
            >
              Tutti
            </button>
          )}
        </div>

<span className="ml-auto text-sm" style={{ color: "var(--color-grey-mid)" }}>
          {filtered.length} carichi
        </span>
      </div>

      {/* Tabella */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <Th col="titolo" label="Titolo" />
              <Th col="dataCarico" label="Data Carico" />
              <Th col="commessa" label="Commessa" />
              <Th col="modalita" label="Modalità" />
              <Th col="stato" label="Stato" />
              <Th col="odp" label="ODP" className="text-right" />
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessun carico trovato
                </td>
              </tr>
            ) : (
              filtered.map(c => {
                const commessa = commessaMap.get(c.commessaId ?? "");
                return (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-orange-50/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{c.titolo || "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{fmt(c.dataCarico)}</td>
                    <td className="px-4 py-3">
                      {commessa ? (
                        <div>
                          <span className="font-medium">{commessa.numeroCommessa}</span>
                          {commessa.cliente && (
                            <span className="ml-1.5 text-xs" style={{ color: "var(--color-grey-mid)" }}>{commessa.cliente}</span>
                          )}
                          {commessa.localita && (
                            <div className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>{commessa.localita}</div>
                          )}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {c.modalita ? <BadgeStato stato={c.modalita} /> : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {c.stato ? <BadgeStato stato={c.stato} /> : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {c.odpIds.length > 0 ? c.odpIds.length : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={c.notionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 rounded font-medium"
                        style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)" }}
                      >
                        Notion ↗
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
