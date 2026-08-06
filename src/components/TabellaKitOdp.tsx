"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Scheda } from "@/lib/types";

interface RowState {
  stato: "" | "Si" | "No";
  saving: boolean;
  error: string | null;
}

export default function TabellaKitOdp({ schede: initial }: { schede: Scheda[] }) {
  const [schede, setSchede] = useState(initial);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const map: Record<string, RowState> = {};
    initial.forEach(s => { map[s.id] = { stato: (s.kitFerramenta as RowState["stato"]) || "", saving: false, error: null }; });
    return map;
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return schede;
    return schede.filter(s => `${s.odp} ${s.numeroScheda} ${s.clienteInfo}`.toLowerCase().includes(q));
  }, [schede, search]);

  function setRow(id: string, patch: Partial<RowState>) {
    setRows(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function salvaStato(s: Scheda, stato: RowState["stato"]) {
    setRow(s.id, { stato, saving: true, error: null });
    try {
      const res = await fetch(`/api/ferramenta/kit/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: stato || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setSchede(prev => prev.map(x => x.id === s.id ? { ...x, kitFerramenta: stato } : x));
      setRow(s.id, { saving: false });
    } catch (e) {
      setRow(s.id, { saving: false, error: e instanceof Error ? e.message : "Errore salvataggio" });
    }
  }

  async function eliminaFoglio(s: Scheda) {
    if (!confirm(`Eliminare il foglio di scarico di ${s.odp || s.numeroScheda}? Azzera il kit e cancella tutte le righe della distinta già inserite — non è recuperabile.`)) return;
    setRow(s.id, { saving: true, error: null });
    try {
      const res = await fetch(`/api/ferramenta/kit/${s.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setSchede(prev => prev.map(x => x.id === s.id ? { ...x, kitFerramenta: "" } : x));
      setRow(s.id, { stato: "", saving: false });
    } catch (e) {
      setRow(s.id, { saving: false, error: e instanceof Error ? e.message : "Errore eliminazione" });
    }
  }

  const inputCls = "border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

  return (
    <div className="space-y-3">
      <input
        className={inputCls + " min-w-52"}
        placeholder="Cerca ODP, scheda, cliente…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

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
              filtered.map(s => {
                const row = rows[s.id];
                if (!row) return null;
                return (
                  <tr key={s.id} className="border-b last:border-0 align-top">
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{s.odp || "—"}</td>
                    <td className="px-4 py-3 font-medium">
                      {s.numeroScheda || "—"}
                      <div className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>{s.clienteInfo}</div>
                    </td>
                    <td className="px-4 py-3">
                      {row.stato === "Si" ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#D1FAE5", color: "#065F46" }}>
                            Sì — kit confermato
                          </span>
                          <button
                            type="button"
                            onClick={() => eliminaFoglio(s)}
                            disabled={row.saving}
                            className="text-xs px-2 py-0.5 rounded-full font-medium border disabled:opacity-60"
                            style={{ color: "#991B1B", background: "white", borderColor: "#FCA5A5" }}
                          >
                            {row.saving ? "…" : "Elimina foglio"}
                          </button>
                        </div>
                      ) : (
                        <select
                          className={inputCls}
                          value={row.stato}
                          onChange={(e) => salvaStato(s, e.target.value as RowState["stato"])}
                        >
                          <option value="">Da valutare</option>
                          <option value="No">No</option>
                        </select>
                      )}
                      {row.error && <div className="text-xs mt-1" style={{ color: "#991B1B" }}>{row.error}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/ferramenta/kit/${s.id}`}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap border"
                        style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}
                      >
                        Gestisci distinta →
                      </Link>
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
