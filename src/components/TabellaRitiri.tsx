"use client";

import { useState, useMemo } from "react";
import type { Ritiro } from "@/lib/types";
import BadgeStato from "./BadgeStato";
import FormModificaRitiro from "./FormModificaRitiro";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

export default function TabellaRitiri({ ritiri: initial }: { ritiri: Ritiro[] }) {
  const [ritiri, setRitiri] = useState(initial);
  const [search, setSearch] = useState("");
  const [filtroStato, setFiltroStato] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroUrgente, setFiltroUrgente] = useState(false);
  const [editing, setEditing] = useState<Ritiro | null>(null);

  const statiUniq = useMemo(
    () => Array.from(new Set(ritiri.map((r) => r.stato).filter(Boolean))).sort(),
    [ritiri]
  );
  const tipiUniq = useMemo(
    () => Array.from(new Set(ritiri.map((r) => r.tipoMovimento).filter(Boolean))).sort(),
    [ritiri]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return ritiri.filter((r) => {
      if (q && !`${r.causale} ${r.numeroOrdine} ${r.fornitore} ${r.descrizioneMerce}`.toLowerCase().includes(q)) return false;
      if (filtroStato && r.stato !== filtroStato) return false;
      if (filtroTipo && r.tipoMovimento !== filtroTipo) return false;
      if (filtroUrgente && !r.urgenza) return false;
      return true;
    });
  }, [ritiri, search, filtroStato, filtroTipo, filtroUrgente]);

  function handleSave(updated: Ritiro) {
    setRitiri((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setEditing(null);
  }

  const inputCls = "border rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          className={inputCls + " min-w-48"}
          placeholder="Cerca causale, fornitore…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={inputCls} value={filtroStato} onChange={(e) => setFiltroStato(e.target.value)}>
          <option value="">Tutti gli stati</option>
          {statiUniq.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={inputCls} value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
          <option value="">Tutti i tipi</option>
          {tipiUniq.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={filtroUrgente} onChange={(e) => setFiltroUrgente(e.target.checked)} className="accent-orange-500" />
          Solo urgenti
        </label>
        <span className="ml-auto text-sm self-center" style={{ color: "var(--color-grey-mid)" }}>
          {filtered.length} movimenti
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <th className="px-4 py-3">Causale</th>
              <th className="px-4 py-3">N° Ordine</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Stato</th>
              <th className="px-4 py-3">Data Trasporto</th>
              <th className="px-4 py-3">Urgenza</th>
              <th className="px-4 py-3">Fornitore</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessun movimento trovato
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-orange-50/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{r.causale || "—"}</td>
                  <td className="px-4 py-3 text-xs">{r.numeroOrdine || "—"}</td>
                  <td className="px-4 py-3">
                    {r.tipoMovimento ? <BadgeStato stato={r.tipoMovimento} /> : "—"}
                  </td>
                  <td className="px-4 py-3"><BadgeStato stato={r.stato} /></td>
                  <td className="px-4 py-3 tabular-nums">{fmt(r.dataTrasporto)}</td>
                  <td className="px-4 py-3">
                    {r.urgenza ? (
                      <span className="text-red-600 font-semibold text-xs">Urgente</span>
                    ) : (
                      <span style={{ color: "var(--color-grey-icon)" }} className="text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{r.fornitore || "—"}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setEditing(r)}
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
        <FormModificaRitiro
          ritiro={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
