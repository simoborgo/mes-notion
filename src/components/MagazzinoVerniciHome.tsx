"use client";

import { useMemo, useState } from "react";
import type { Vernice } from "@/lib/types";
import MagazzinoVerniceCaricoScaricoModal from "./MagazzinoVerniceCaricoScaricoModal";

type SortKey =
  | "codiceInventario" | "coloreNome" | "tipologia" | "tipoBilancioMassa" | "unitaMisura"
  | "codiceTintometro" | "finitura" | "gloss"
  | "clienteRiferimento" | "giacenzaAttuale";
type SortDir = "asc" | "desc";

function valoreOrdinamento(v: Vernice, key: SortKey): string | number {
  if (key === "giacenzaAttuale") return v.giacenzaAttuale;
  return (v[key] as string) ?? "";
}

function cmp(a: Vernice, b: Vernice, key: SortKey, dir: SortDir): number {
  const va = valoreOrdinamento(a, key);
  const vb = valoreOrdinamento(b, key);
  const res = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "it");
  return dir === "asc" ? res : -res;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className="ml-1 inline-block text-[10px] opacity-60">
      {active ? (dir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );
}

function Th({
  label, sortKey: key, currentSortKey, sortDir, onSort, className = "",
}: {
  label: string;
  sortKey: SortKey;
  currentSortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = key === currentSortKey;
  return (
    <th
      className={`px-4 py-3 whitespace-nowrap select-none cursor-pointer hover:bg-orange-50/50 ${className}`}
      onClick={() => onSort(key)}
    >
      {label}
      <SortIcon active={active} dir={active ? sortDir : "asc"} />
    </th>
  );
}

export default function MagazzinoVerniciHome({ vernici }: { vernici: Vernice[] }) {
  const [search, setSearch] = useState("");
  const [modale, setModale] = useState<{ vernice: Vernice; tipo: "carico" | "scarico" } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("codiceInventario");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = q
      ? vernici.filter(v =>
          `${v.coloreNome ?? ""} ${v.tipologia} ${v.fornitore ?? ""} ${v.codiceInventario ?? ""} ${v.codiceTintometro ?? ""}`
            .toLowerCase().includes(q)
        )
      : vernici;
    return [...base].sort((a, b) => cmp(a, b, sortKey, sortDir));
  }, [vernici, search, sortKey, sortDir]);

  return (
    <div className="space-y-3">
      <input
        className="border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 min-w-52"
        placeholder="Cerca colore, tipologia, fornitore, codici…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <Th label="Codice Inventario" sortKey="codiceInventario" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Nome Colore" sortKey="coloreNome" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="min-w-[140px]" />
              <Th label="Tipologia" sortKey="tipologia" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Bilancio Massa" sortKey="tipoBilancioMassa" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Unità Misura" sortKey="unitaMisura" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Codice Tintometro" sortKey="codiceTintometro" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Finitura" sortKey="finitura" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Gloss" sortKey="gloss" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Cliente Riferimento" sortKey="clienteRiferimento" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Giacenza" sortKey="giacenzaAttuale" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessuna vernice trovata
                </td>
              </tr>
            ) : (
              filtered.map(v => (
                <tr key={v.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{v.codiceInventario || "—"}</td>
                  <td className="px-4 py-3 font-medium">{v.coloreNome || "—"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{v.tipologia}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{v.tipoBilancioMassa || "—"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{v.unitaMisura || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{v.codiceTintometro || "—"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{v.finitura || "—"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{v.gloss || "—"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{v.clienteRiferimento || "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{v.giacenzaAttuale}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setModale({ vernice: v, tipo: "carico" })}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap border"
                        style={{ color: "#166534", background: "rgba(22,101,52,0.08)", borderColor: "rgba(22,101,52,0.3)" }}
                      >
                        Carico
                      </button>
                      <button
                        onClick={() => setModale({ vernice: v, tipo: "scarico" })}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap border"
                        style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}
                      >
                        Scarico
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modale && (
        <MagazzinoVerniceCaricoScaricoModal
          vernice={modale.vernice}
          tipo={modale.tipo}
          onClose={() => setModale(null)}
        />
      )}
    </div>
  );
}
