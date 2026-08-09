"use client";

import { useMemo, useState } from "react";
import type { Ciclo, StatoCiclo } from "@/lib/types";
import BadgeStato from "./BadgeStato";
import CicloModal from "./CicloModal";
import { Th } from "./SortableTh";

const inputCls = "border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

type SortKey = "nome" | "stato" | "versione" | "validatoAt" | "createdAt";
type SortDir = "asc" | "desc";

function cmp(a: Ciclo, b: Ciclo, key: SortKey, dir: SortDir): number {
  let res: number;
  if (key === "versione") res = a.versione - b.versione;
  else if (key === "validatoAt" || key === "createdAt") res = (a[key] ?? "").localeCompare(b[key] ?? "");
  else if (key === "nome") res = (a.nome ?? "").localeCompare(b.nome ?? "", "it");
  else res = a.stato.localeCompare(b.stato, "it");
  return dir === "asc" ? res : -res;
}

export default function TabellaCicli({ cicli: initial }: { cicli: Ciclo[] }) {
  const [cicli, setCicli] = useState(initial);
  const [search, setSearch] = useState("");
  const [statoFiltro, setStatoFiltro] = useState<StatoCiclo | "">("");
  const [modaleAperta, setModaleAperta] = useState(false);
  const [cicloIdAperto, setCicloIdAperto] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const filtrati = useMemo(() => {
    const q = search.toLowerCase().trim();
    return cicli
      .filter((c) => {
        if (statoFiltro && c.stato !== statoFiltro) return false;
        if (q && !(c.nome ?? "").toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => cmp(a, b, sortKey, sortDir));
  }, [cicli, search, statoFiltro, sortKey, sortDir]);

  function apriModifica(id: string) {
    setCicloIdAperto(id);
    setModaleAperta(true);
  }
  function apriNuovo() {
    setCicloIdAperto(null);
    setModaleAperta(true);
  }
  function handleSaved(c: Ciclo) {
    setCicli((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [c, ...prev]));
    setCicloIdAperto(c.id);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input className={inputCls + " min-w-52"} placeholder="Cerca per nome scheda…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={inputCls} value={statoFiltro} onChange={(e) => setStatoFiltro(e.target.value as StatoCiclo | "")}>
          <option value="">Tutti gli stati</option>
          <option value="bozza">Bozza</option>
          <option value="validato">Validato</option>
        </select>
        <button
          onClick={apriNuovo}
          className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #7C3AED, #DB2777)" }}
        >
          + Nuova scheda
        </button>
      </div>

      {modaleAperta && (
        <CicloModal cicloId={cicloIdAperto} onClose={() => setModaleAperta(false)} onSaved={handleSaved} />
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <Th label="Nome scheda" sortKey="nome" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Stato" sortKey="stato" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Versione" sortKey="versione" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3">Derivato da</th>
              <Th label="Validato il" sortKey="validatoAt" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Creato il" sortKey="createdAt" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtrati.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessuna scheda trovata</td></tr>
            ) : (
              filtrati.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-orange-50/30 cursor-pointer" onClick={() => apriModifica(c.id)}>
                  <td className="px-4 py-3 font-medium">{c.nome || "— senza nome —"}</td>
                  <td className="px-4 py-3"><BadgeStato stato={c.stato === "bozza" ? "Bozza" : "Validato"} /></td>
                  <td className="px-4 py-3">v{c.versione}</td>
                  <td className="px-4 py-3 text-xs font-mono" style={{ color: "var(--color-grey-mid)" }}>{c.cicloPadreId ? c.cicloPadreId.slice(0, 8) : "—"}</td>
                  <td className="px-4 py-3 text-xs">{c.validatoAt ? fmtData(c.validatoAt) : "—"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{fmtData(c.createdAt)}</td>
                  <td className="px-4 py-3 text-xs underline" style={{ color: "var(--color-primary)" }}>Apri</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
