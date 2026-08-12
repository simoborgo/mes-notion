"use client";

import { useEffect, useMemo, useState } from "react";
import type { Vernice } from "@/lib/types";
import VerniceFormModal from "./VerniceFormModal";
import { Th } from "./SortableTh";

const inputCls = "border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

type SortKey = "colore" | "tipologia" | "clienteRiferimento" | "fornitore" | "codiceTintometro" | "codiceInventario" | "unitaMisura" | "bilancioMassa" | "attivo";
type SortDir = "asc" | "desc";

function valoreOrdinamento(v: Vernice, key: SortKey): string | boolean {
  switch (key) {
    case "colore": return v.coloreCodice || v.coloreNome || "";
    case "fornitore": return v.fornitore ?? "";
    case "codiceTintometro": return v.codiceTintometro ?? "";
    case "codiceInventario": return v.codiceInventario ?? "";
    case "unitaMisura": return v.unitaMisura ?? "";
    case "clienteRiferimento": return v.clienteRiferimento ?? "";
    case "bilancioMassa": return v.tipoBilancioMassa || v.bilancioMassaRaw || "";
    case "attivo": return v.attivo;
    default: return v[key] as string;
  }
}

function cmp(a: Vernice, b: Vernice, key: SortKey, dir: SortDir): number {
  const va = valoreOrdinamento(a, key);
  const vb = valoreOrdinamento(b, key);
  const res = typeof va === "boolean" && typeof vb === "boolean" ? (va === vb ? 0 : va ? 1 : -1) : String(va).localeCompare(String(vb), "it");
  return dir === "asc" ? res : -res;
}

export default function TabellaVernici({ vernici: initial }: { vernici: Vernice[] }) {
  const [vernici, setVernici] = useState(initial);
  const [clienti, setClienti] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [clienteFiltro, setClienteFiltro] = useState("");
  const [soloAttive, setSoloAttive] = useState(true);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [verniceInModifica, setVerniceInModifica] = useState<Vernice | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("colore");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    fetch("/api/verniciatura/campionature/clienti").then((r) => r.json()).then((c) => Array.isArray(c) && setClienti(c)).catch(() => {});
  }, []);

  function applicaFiltri() {
    setSearch(searchInput);
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const filtrate = useMemo(() => {
    const q = search.toLowerCase().trim();
    return vernici
      .filter((v) => {
        if (soloAttive && !v.attivo) return false;
        if (clienteFiltro && v.clienteRiferimento !== clienteFiltro) return false;
        if (!q) return true;
        const testo = `${v.coloreCodice ?? ""} ${v.coloreNome ?? ""} ${v.tipologia} ${v.codiceInventario ?? ""} ${v.codiceTintometro ?? ""} ${v.codiceVendita ?? ""} ${v.clienteRiferimento ?? ""} ${v.fornitore ?? ""}`.toLowerCase();
        return testo.includes(q);
      })
      .sort((a, b) => cmp(a, b, sortKey, sortDir));
  }, [vernici, search, clienteFiltro, soloAttive, sortKey, sortDir]);

  function handleUpsert(v: Vernice) {
    setVernici((prev) => {
      const esiste = prev.some((x) => x.id === v.id);
      return esiste ? prev.map((x) => (x.id === v.id ? v : x)) : [v, ...prev];
    });
    setModaleAperta(false);
    setVerniceInModifica(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className={inputCls + " min-w-52"}
          placeholder="Cerca colore, tipologia, fornitore, codice, cliente…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") applicaFiltri(); }}
        />
        <select className={inputCls} value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)}>
          <option value="">Tutti i clienti</option>
          {clienti.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          onClick={() => setSoloAttive((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded border text-sm font-medium transition-colors"
          style={soloAttive
            ? { background: "#DCFCE7", color: "#166534", borderColor: "#86EFAC" }
            : { background: "white", color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}
        >
          Solo attive
        </button>
        <button onClick={applicaFiltri} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "var(--color-primary)" }}>
          Cerca
        </button>
        <button
          onClick={() => { setVerniceInModifica(null); setModaleAperta(true); }}
          className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #7C3AED, #DB2777)" }}
        >
          + Nuova vernice
        </button>
      </div>

      {modaleAperta && (
        <VerniceFormModal
          vernice={verniceInModifica}
          onClose={() => { setModaleAperta(false); setVerniceInModifica(null); }}
          onSalvato={handleUpsert}
        />
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <Th label="Colore" sortKey="colore" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Tipologia" sortKey="tipologia" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Cliente" sortKey="clienteRiferimento" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Fornitore" sortKey="fornitore" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Codice tintometro" sortKey="codiceTintometro" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Cod. inventario" sortKey="codiceInventario" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="U.M." sortKey="unitaMisura" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Bilancio massa" sortKey="bilancioMassa" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3">TS / SDS</th>
              <Th label="Attivo" sortKey="attivo" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtrate.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessuna vernice trovata
                </td>
              </tr>
            ) : (
              filtrate.map((v) => (
                <tr key={v.id} className="border-b last:border-0 align-top hover:bg-orange-50/30 cursor-pointer" onClick={() => { setVerniceInModifica(v); setModaleAperta(true); }}>
                  <td className="px-4 py-3 font-medium">{v.coloreCodice || v.coloreNome || "—"}</td>
                  <td className="px-4 py-3">{v.tipologia}</td>
                  <td className="px-4 py-3">
                    {v.clienteRiferimento
                      ? <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#FCE7F3", color: "#9D174D" }}>{v.clienteRiferimento}</span>
                      : <span style={{ color: "var(--color-grey-mid)" }}>—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{v.fornitore || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{v.codiceTintometro || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{v.codiceInventario || "—"}</td>
                  <td className="px-4 py-3">{v.unitaMisura || "—"}</td>
                  <td className="px-4 py-3">
                    {v.tipoBilancioMassa ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#CCFBF1", color: "#0F766E" }}>{v.tipoBilancioMassa}</span>
                    ) : v.bilancioMassaRaw ? (
                      <span className="text-xs font-mono italic" style={{ color: "var(--color-grey-mid)" }} title="Sigla grezza, non ancora decodificata">{v.bilancioMassaRaw}</span>
                    ) : (
                      <span style={{ color: "var(--color-grey-mid)" }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={v.tsDriveFileId ? { background: "#D1FAE5", color: "#065F46" } : { background: "#FEE2E2", color: "#991B1B" }}>TS</span>
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={v.sdsDriveFileId ? { background: "#D1FAE5", color: "#065F46" } : { background: "#FEE2E2", color: "#991B1B" }}>SDS</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {v.attivo
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
