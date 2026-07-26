"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ArticoloFerramenta } from "@/lib/types";

function isSottoSoglia(a: ArticoloFerramenta): boolean {
  return a.sogliaMinima != null && a.giacenzaAttuale < a.sogliaMinima;
}

export default function FerramentaHome({ articoli }: { articoli: ArticoloFerramenta[] }) {
  const [search, setSearch] = useState("");
  const [soloDaRiordinare, setSoloDaRiordinare] = useState(true);

  const attivi = useMemo(() => articoli.filter(a => a.attivo), [articoli]);

  const daRiordinareCount = useMemo(
    () => attivi.filter(isSottoSoglia).length,
    [attivi]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return attivi
      .filter(a => {
        if (soloDaRiordinare && !isSottoSoglia(a)) return false;
        if (q && !`${a.descrizione} ${a.codiceOs1} ${a.fornitoreNome}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.descrizione.localeCompare(b.descrizione));
  }, [attivi, search, soloDaRiordinare]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <input
          className="border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 min-w-52"
          placeholder="Cerca descrizione, codice, fornitore…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          onClick={() => setSoloDaRiordinare(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded border text-sm font-medium transition-colors"
          style={soloDaRiordinare
            ? { background: "#FEE2E2", color: "#991B1B", borderColor: "#FCA5A5" }
            : { background: "white", color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}
        >
          ⚠ Da riordinare
          {daRiordinareCount > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full text-xs font-bold w-5 h-5"
              style={soloDaRiordinare ? { background: "#991B1B", color: "white" } : { background: "#FEE2E2", color: "#991B1B" }}
            >
              {daRiordinareCount}
            </span>
          )}
        </button>
        <Link
          href="/ferramenta/fogli-scarico"
          className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold border transition-colors hover:bg-gray-50"
          style={{ color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}
        >
          Fogli di scarico
        </Link>
        <Link
          href="/ferramenta/inventario"
          className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors hover:bg-gray-50"
          style={{ color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}
        >
          Inventario
        </Link>
        <Link
          href="/ferramenta/carico"
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: "var(--color-primary)", color: "white" }}
        >
          + Carico
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <th className="px-4 py-3">Codice OS1</th>
              <th className="px-4 py-3 min-w-[200px]">Descrizione</th>
              <th className="px-4 py-3">Fornitore</th>
              <th className="px-4 py-3">Metodo</th>
              <th className="px-4 py-3">Giacenza</th>
              <th className="px-4 py-3">Soglia Minima</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessun articolo trovato
                </td>
              </tr>
            ) : (
              filtered.map(a => {
                const sotto = isSottoSoglia(a);
                return (
                  <tr key={a.id} className="border-b last:border-0" style={sotto ? { background: "#FFF8F8" } : undefined}>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{a.codiceOs1 || "—"}</td>
                    <td className="px-4 py-3 font-medium">{a.descrizione}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{a.fornitoreNome || "—"}</td>
                    <td className="px-4 py-3">
                      {a.metodoGestione ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#F3F4F6", color: "#374151" }}>
                          {a.metodoGestione}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#FEF9C3", color: "#92400E" }}>
                          Non classificato
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {sotto ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: "#FEE2E2", color: "#991B1B" }}>
                          ⚠ {a.giacenzaAttuale} {a.unitaMisura}
                        </span>
                      ) : (
                        <span>{a.giacenzaAttuale} {a.unitaMisura}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{a.sogliaMinima ?? "—"}</td>
                    <td className="px-4 py-3">
                      {a.metodoGestione && (
                        <Link
                          href={`/ferramenta/scarico/${a.id}`}
                          className="text-sm px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap border"
                          style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}
                        >
                          Scarica
                        </Link>
                      )}
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
