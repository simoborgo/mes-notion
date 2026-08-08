"use client";

import { useMemo, useState } from "react";
import type { Operatore } from "@/lib/types";

const inputCls = "rounded-lg border px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

export default function TabellaOperatoriReadOnly({ operatori }: { operatori: Operatore[] }) {
  const [search, setSearch] = useState("");
  const [soloInForza, setSoloInForza] = useState(true);

  const interni = operatori.filter(o => o.tipo === "Modar").length;
  const esterni = operatori.filter(o => o.tipo === "Esterno").length;
  const inForza = operatori.filter(o => o.inForza).length;

  // Riepilogo per reparto (sempre sul totale, non sui filtri di ricerca/in forza sopra —
  // stessa logica dei badge Totale/In forza/Interni/Esterni) — ordinato dal reparto più numeroso.
  const perReparto = useMemo(() => {
    const map = new Map<string, { totale: number; interni: number; esterni: number }>();
    for (const o of operatori) {
      const rep = o.reparto || "Non specificato";
      const cur = map.get(rep) ?? { totale: 0, interni: 0, esterni: 0 };
      cur.totale++;
      if (o.tipo === "Modar") cur.interni++;
      else if (o.tipo === "Esterno") cur.esterni++;
      map.set(rep, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].totale - a[1].totale);
  }, [operatori]);

  const filtrati = useMemo(() => {
    const q = search.toLowerCase().trim();
    return operatori.filter(o => {
      if (soloInForza && !o.inForza) return false;
      if (!q) return true;
      return `${o.cognome} ${o.nome} ${o.matricola} ${o.reparto} ${o.azienda}`.toLowerCase().includes(q);
    });
  }, [operatori, search, soloInForza]);

  return (
    <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: "#e5e4e0" }}>
      <div>
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>Personale (da Notion — sola lettura)</h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
          Solo visualizzazione per ora — attivazione/disattivazione e anagrafica restano gestite su Notion.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "#F5F2EE", color: "var(--color-black)" }}>
          Totale: {operatori.length}
        </div>
        <div className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "#F0FDF4", color: "#166534" }}>
          In forza: {inForza}
        </div>
        <div className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "#EFF6FF", color: "#1D4ED8" }}>
          Interni (Modar): {interni}
        </div>
        <div className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "#FEF9C3", color: "#92400E" }}>
          Esterni: {esterni}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {perReparto.map(([reparto, c]) => (
          <div key={reparto} className="rounded-lg px-2.5 py-1.5 text-xs font-medium" style={{ background: "#F5F2EE", color: "var(--color-black)" }}>
            {reparto}: {c.totale}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {perReparto.map(([reparto, c]) => (
          <div key={reparto} className="rounded-lg px-2.5 py-1.5 text-xs font-medium" style={{ background: "#F5F2EE", color: "var(--color-grey-mid)" }}>
            <span style={{ color: "var(--color-black)" }}>{reparto}</span>
            {" — "}
            <span style={{ color: "#1D4ED8" }}>{c.interni} int.</span>
            {" · "}
            <span style={{ color: "#92400E" }}>{c.esterni} est.</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text" className={inputCls} style={{ minWidth: 220 }}
          placeholder="Cerca nome, matricola, reparto, azienda…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--color-grey-mid)" }}>
          <input type="checkbox" checked={soloInForza} onChange={e => setSoloInForza(e.target.checked)} className="w-3.5 h-3.5 accent-orange-500" />
          Solo in forza
        </label>
        <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{filtrati.length} risultati</span>
      </div>

      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
        <table className="text-sm w-full">
          <thead>
            <tr className="border-b text-xs font-semibold uppercase" style={{ borderColor: "#e5e4e0", color: "var(--color-grey-mid)" }}>
              <th className="text-left px-3 py-2">Matricola</th>
              <th className="text-left px-3 py-2">Cognome Nome</th>
              <th className="text-left px-3 py-2">Reparto</th>
              <th className="text-left px-3 py-2">Tipo</th>
              <th className="text-left px-3 py-2">Azienda</th>
              <th className="text-center px-3 py-2">In forza</th>
            </tr>
          </thead>
          <tbody>
            {filtrati.map(o => (
              <tr key={o.id} className="border-b last:border-0" style={{ borderColor: "#f0ece5" }}>
                <td className="px-3 py-2 font-mono text-xs">{o.matricola}</td>
                <td className="px-3 py-2 font-medium">{o.cognome} {o.nome}</td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--color-grey-mid)" }}>{o.reparto || "—"}</td>
                <td className="px-3 py-2 text-xs">
                  <span
                    className="px-2 py-0.5 rounded-full font-semibold"
                    style={o.tipo === "Modar" ? { background: "#EFF6FF", color: "#1D4ED8" } : { background: "#FEF9C3", color: "#92400E" }}
                  >
                    {o.tipo === "Modar" ? "Interno" : o.tipo || "—"}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--color-grey-mid)" }}>{o.azienda || "—"}</td>
                <td className="px-3 py-2 text-center">
                  {o.inForza
                    ? <span className="text-xs font-semibold" style={{ color: "#166534" }}>Sì</span>
                    : <span className="text-xs font-semibold" style={{ color: "#991B1B" }}>No</span>}
                </td>
              </tr>
            ))}
            {filtrati.length === 0 && (
              <tr><td colSpan={6} className="text-center py-6 text-xs" style={{ color: "var(--color-grey-mid)" }}>Nessun operatore trovato</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
