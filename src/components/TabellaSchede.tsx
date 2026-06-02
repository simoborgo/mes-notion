"use client";

import { useState, useMemo } from "react";
import type { Scheda } from "@/lib/types";
import BadgeStato from "./BadgeStato";
import FormModificaScheda from "./FormModificaScheda";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

export default function TabellaSchede({ schede: initial }: { schede: Scheda[] }) {
  const [schede, setSchede] = useState(initial);
  const [search, setSearch] = useState("");
  const [filtroStato, setFiltroStato] = useState("");
  const [filtroEsterna, setFiltroEsterna] = useState<"" | "si" | "no">("");
  const [editing, setEditing] = useState<Scheda | null>(null);

  const statiUniq = useMemo(
    () => Array.from(new Set(schede.map((s) => s.statoProduzione).filter(Boolean))).sort(),
    [schede]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return schede.filter((s) => {
      if (q && !`${s.odp} ${s.clienteInfo} ${s.numeroScheda} ${s.commessaNr}`.toLowerCase().includes(q)) return false;
      if (filtroStato && s.statoProduzione !== filtroStato) return false;
      if (filtroEsterna === "si" && !s.produzioneEsterna) return false;
      if (filtroEsterna === "no" && s.produzioneEsterna) return false;
      return true;
    });
  }, [schede, search, filtroStato, filtroEsterna]);

  function handleSave(updated: Scheda) {
    setSchede((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setEditing(null);
  }

  const inputCls = "border rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";
  const selectCls = inputCls;

  return (
    <div className="space-y-4">
      {/* Filtri */}
      <div className="flex flex-wrap gap-3">
        <input
          className={inputCls + " min-w-48"}
          placeholder="Cerca ODP, cliente, N° scheda…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={selectCls} value={filtroStato} onChange={(e) => setFiltroStato(e.target.value)}>
          <option value="">Tutti gli stati</option>
          {statiUniq.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={selectCls} value={filtroEsterna} onChange={(e) => setFiltroEsterna(e.target.value as "" | "si" | "no")}>
          <option value="">Interna + Esterna</option>
          <option value="si">Solo Esterna</option>
          <option value="no">Solo Interna</option>
        </select>
        <span className="ml-auto text-sm self-center" style={{ color: "var(--color-grey-mid)" }}>
          {filtered.length} schede
        </span>
      </div>

      {/* Tabella */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <th className="px-4 py-3">ODP</th>
              <th className="px-4 py-3">N° Scheda</th>
              <th className="px-4 py-3">Cliente / Commessa</th>
              <th className="px-4 py-3">Stato</th>
              <th className="px-4 py-3">Data Prev.</th>
              <th className="px-4 py-3">Esterna</th>
              <th className="px-4 py-3">Fornitore</th>
              <th className="px-4 py-3">Rientro Prev.</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessuna scheda trovata
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-orange-50/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{s.odp || "—"}</td>
                  <td className="px-4 py-3">{s.numeroScheda || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.clienteInfo || "—"}</div>
                    {s.commessaNr && <div className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{s.commessaNr}</div>}
                  </td>
                  <td className="px-4 py-3"><BadgeStato stato={s.statoProduzione} /></td>
                  <td className="px-4 py-3 tabular-nums">{fmt(s.dataProduzionePrevista)}</td>
                  <td className="px-4 py-3">
                    {s.produzioneEsterna ? (
                      <span className="text-blue-600 font-medium text-xs">Sì</span>
                    ) : (
                      <span style={{ color: "var(--color-grey-icon)" }} className="text-xs">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{s.fornitore || "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{fmt(s.dataRientroPrevista)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setEditing(s)}
                      className="text-xs px-2 py-1 rounded font-medium transition-colors"
                      style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)" }}
                    >
                      Modifica
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <FormModificaScheda
          scheda={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
