"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type StatoPreparazione = "mancante" | "parziale" | "completo";

interface OdpKitRow {
  id: string;
  odp: string;
  numeroScheda: string;
  clienteInfo: string;
  stato: StatoPreparazione;
}

const STATO_LABEL: Record<StatoPreparazione, { text: string; bg: string; color: string }> = {
  mancante: { text: "Da scaricare", bg: "#FEE2E2", color: "#991B1B" },
  parziale: { text: "Parziale", bg: "#FEF3C7", color: "#92400E" },
  completo: { text: "Registrati", bg: "#F3F4F6", color: "#374151" },
};

const COLONNE: { stato: StatoPreparazione; titolo: string; band: string; accentBg: string; accentBorder: string }[] = [
  { stato: "mancante", titolo: "Da preparare", band: "#EF4444", accentBg: "#FEF2F2", accentBorder: "#FCA5A5" },
  { stato: "parziale", titolo: "In preparazione", band: "#F59E0B", accentBg: "#FFFBEB", accentBorder: "#FCD34D" },
  { stato: "completo", titolo: "Fatto", band: "#22C55E", accentBg: "#F0FDF4", accentBorder: "#86EFAC" },
];

function Card({ o, col }: { o: OdpKitRow; col: (typeof COLONNE)[number] }) {
  return (
    <Link
      href={`/ferramenta/fogli-scarico/${o.id}`}
      className="block rounded-lg border-t-4 border p-3 transition-shadow hover:shadow-md"
      style={{ borderTopColor: col.band, borderColor: col.accentBorder, background: col.accentBg }}
    >
      <div className="font-mono text-xs" style={{ color: "var(--color-grey-mid)" }}>{o.odp || "—"}</div>
      <div className="font-medium text-sm mt-0.5">{o.numeroScheda || "—"}</div>
      <div className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>{o.clienteInfo}</div>
    </Link>
  );
}

export default function FogliScaricoList({ odp }: { odp: OdpKitRow[] }) {
  const [vista, setVista] = useState<"kanban" | "tabella">("kanban");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return odp;
    return odp.filter(o => `${o.odp} ${o.numeroScheda} ${o.clienteInfo}`.toLowerCase().includes(q));
  }, [odp, search]);

  const mancantiCount = useMemo(() => odp.filter(o => o.stato === "mancante").length, [odp]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            className="border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 min-w-52"
            placeholder="Cerca ODP, scheda, cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {mancantiCount > 0 && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded border text-sm font-medium"
              style={{ background: "#FEE2E2", color: "#991B1B", borderColor: "#FCA5A5" }}
            >
              ⚠ {mancantiCount} da preparare
            </span>
          )}
        </div>
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "#d1d5db" }}>
          {(["kanban", "tabella"] as const).map(v => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className="px-3 py-1.5 text-sm font-medium capitalize transition-colors"
              style={vista === v
                ? { background: "var(--color-primary)", color: "white" }
                : { background: "white", color: "var(--color-grey-mid)" }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {vista === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {COLONNE.map(col => {
            const righe = filtered.filter(o => o.stato === col.stato);
            return (
              <div key={col.stato} className="rounded-lg border overflow-hidden bg-[#faf9f7]" style={{ borderColor: "#e5e7eb" }}>
                <div className="flex items-center justify-between px-3 py-2.5" style={{ background: col.band }}>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-white">
                    {col.titolo}
                  </h3>
                  <span
                    className="inline-flex items-center justify-center rounded-full text-xs font-bold w-5 h-5 bg-white/90"
                    style={{ color: col.band }}
                  >
                    {righe.length}
                  </span>
                </div>
                <div className="space-y-2 p-3">
                  {righe.length === 0 ? (
                    <p className="text-xs text-center py-6" style={{ color: "var(--color-grey-mid)" }}>Nessun ODP</p>
                  ) : (
                    righe.map(o => <Card key={o.id} o={o} col={col} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
                <th className="px-4 py-3">ODP</th>
                <th className="px-4 py-3 min-w-[160px]">Scheda / Cliente</th>
                <th className="px-4 py-3">Stato</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                    Nessun ODP trovato
                  </td>
                </tr>
              ) : (
                filtered.map(o => {
                  const s = STATO_LABEL[o.stato];
                  return (
                    <tr key={o.id} className="border-b last:border-0" style={o.stato === "mancante" ? { background: "#FFF8F8" } : undefined}>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{o.odp || "—"}</td>
                      <td className="px-4 py-3 font-medium">
                        {o.numeroScheda || "—"}
                        <div className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>{o.clienteInfo}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: s.bg, color: s.color }}>{s.text}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/ferramenta/fogli-scarico/${o.id}`}
                          className="text-sm px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap border"
                          style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}
                        >
                          Apri richiesta
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
