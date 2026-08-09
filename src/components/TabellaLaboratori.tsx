"use client";

import { useMemo, useState } from "react";
import type { Laboratorio } from "@/lib/types";
import LaboratorioFormModal from "./LaboratorioFormModal";
import { Th } from "./SortableTh";

const inputCls = "border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

type SortKey = "nome" | "note" | "attivo";
type SortDir = "asc" | "desc";

function cmp(a: Laboratorio, b: Laboratorio, key: SortKey, dir: SortDir): number {
  const va = key === "attivo" ? a.attivo : key === "note" ? (a.note ?? "") : a.nome;
  const vb = key === "attivo" ? b.attivo : key === "note" ? (b.note ?? "") : b.nome;
  const res = typeof va === "boolean" && typeof vb === "boolean" ? (va === vb ? 0 : va ? 1 : -1) : String(va).localeCompare(String(vb), "it");
  return dir === "asc" ? res : -res;
}

export default function TabellaLaboratori({ laboratori: initial }: { laboratori: Laboratorio[] }) {
  const [laboratori, setLaboratori] = useState(initial);
  const [search, setSearch] = useState("");
  const [soloAttivi, setSoloAttivi] = useState(true);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [inModifica, setInModifica] = useState<Laboratorio | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("nome");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const filtrati = useMemo(() => {
    const q = search.toLowerCase().trim();
    return laboratori
      .filter((l) => {
        if (soloAttivi && !l.attivo) return false;
        if (q && !l.nome.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => cmp(a, b, sortKey, sortDir));
  }, [laboratori, search, soloAttivi, sortKey, sortDir]);

  function handleUpsert(l: Laboratorio) {
    setLaboratori((prev) => {
      const esiste = prev.some((x) => x.id === l.id);
      return esiste ? prev.map((x) => (x.id === l.id ? l : x)) : [l, ...prev];
    });
    setModaleAperta(false);
    setInModifica(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input className={inputCls + " min-w-52"} placeholder="Cerca nome…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button
          onClick={() => setSoloAttivi((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded border text-sm font-medium transition-colors"
          style={soloAttivi
            ? { background: "#DCFCE7", color: "#166534", borderColor: "#86EFAC" }
            : { background: "white", color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}
        >
          Solo attivi
        </button>
        <button
          onClick={() => { setInModifica(null); setModaleAperta(true); }}
          className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #7C3AED, #DB2777)" }}
        >
          + Nuovo
        </button>
      </div>

      {modaleAperta && (
        <LaboratorioFormModal laboratorio={inModifica} onClose={() => { setModaleAperta(false); setInModifica(null); }} onSalvato={handleUpsert} />
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <Th label="Nome" sortKey="nome" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Note" sortKey="note" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Attivo" sortKey="attivo" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtrati.length === 0 ? (
              <tr><td colSpan={4} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessun fornitore/laboratorio trovato</td></tr>
            ) : (
              filtrati.map((l) => (
                <tr key={l.id} className="border-b last:border-0 hover:bg-orange-50/30 cursor-pointer" onClick={() => { setInModifica(l); setModaleAperta(true); }}>
                  <td className="px-4 py-3 font-medium">{l.nome}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{l.note || "—"}</td>
                  <td className="px-4 py-3">
                    {l.attivo
                      ? <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#DCFCE7", color: "#166534" }}>Sì</span>
                      : <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>No</span>}
                  </td>
                  <td className="px-4 py-3 text-xs underline" style={{ color: "var(--color-primary)" }}>Modifica</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
