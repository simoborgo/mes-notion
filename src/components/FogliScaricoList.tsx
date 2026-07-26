"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

interface OdpKitRow {
  id: string;
  odp: string;
  numeroScheda: string;
  clienteInfo: string;
  haMovimenti: boolean;
}

export default function FogliScaricoList({ odp }: { odp: OdpKitRow[] }) {
  const [soloMancanti, setSoloMancanti] = useState(true);
  const [search, setSearch] = useState("");

  const mancantiCount = useMemo(() => odp.filter(o => !o.haMovimenti).length, [odp]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return odp.filter(o => {
      if (soloMancanti && o.haMovimenti) return false;
      if (q && !`${o.odp} ${o.numeroScheda} ${o.clienteInfo}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [odp, soloMancanti, search]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <input
          className="border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 min-w-52"
          placeholder="Cerca ODP, scheda, cliente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          onClick={() => setSoloMancanti(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded border text-sm font-medium transition-colors"
          style={soloMancanti
            ? { background: "#FEE2E2", color: "#991B1B", borderColor: "#FCA5A5" }
            : { background: "white", color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}
        >
          ⚠ Mancanti
          {mancantiCount > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full text-xs font-bold w-5 h-5"
              style={soloMancanti ? { background: "#991B1B", color: "white" } : { background: "#FEE2E2", color: "#991B1B" }}
            >
              {mancantiCount}
            </span>
          )}
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <th className="px-4 py-3">ODP</th>
              <th className="px-4 py-3 min-w-[160px]">Scheda / Cliente</th>
              <th className="px-4 py-3">Movimenti</th>
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
              filtered.map(o => (
                <tr key={o.id} className="border-b last:border-0" style={!o.haMovimenti ? { background: "#FFF8F8" } : undefined}>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{o.odp || "—"}</td>
                  <td className="px-4 py-3 font-medium">
                    {o.numeroScheda || "—"}
                    <div className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>{o.clienteInfo}</div>
                  </td>
                  <td className="px-4 py-3">
                    {o.haMovimenti ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#F3F4F6", color: "#374151" }}>Registrati</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "#FEE2E2", color: "#991B1B" }}>⚠ Mancante</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/ferramenta/fogli-scarico/${o.id}`}
                      className="text-sm px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap border"
                      style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}
                    >
                      Apri foglio
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
