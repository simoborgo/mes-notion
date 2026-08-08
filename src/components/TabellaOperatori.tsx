"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Operatore } from "@/lib/types";
import FormOperatore from "./FormOperatore";

const inputCls = "rounded-lg border px-2 py-1.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

export default function TabellaOperatori({ operatoriIniziali }: { operatoriIniziali: Operatore[] }) {
  const router = useRouter();
  const [operatori, setOperatori] = useState(operatoriIniziali);
  const [search, setSearch] = useState("");
  const [soloInForza, setSoloInForza] = useState(true);
  const [formAperto, setFormAperto] = useState<"nuovo" | Operatore | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [erroreToggle, setErroreToggle] = useState("");

  const interni = operatori.filter(o => o.tipo === "Modar").length;
  const esterni = operatori.filter(o => o.tipo === "Esterno").length;
  const inForza = operatori.filter(o => o.inForza).length;

  const repartiSuggeriti = useMemo(() => [...new Set(operatori.map(o => o.reparto).filter(Boolean))].sort(), [operatori]);
  const aziendeSuggerite = useMemo(() => [...new Set(operatori.map(o => o.azienda).filter(Boolean))].sort(), [operatori]);

  // Riepilogo per reparto (sempre sul totale, non sui filtri di ricerca/in forza sotto —
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

  function handleSaved(aggiornato: Operatore) {
    setOperatori(prev => {
      const esiste = prev.some(o => o.id === aggiornato.id);
      return esiste ? prev.map(o => (o.id === aggiornato.id ? aggiornato : o)) : [...prev, aggiornato];
    });
    setFormAperto(null);
    router.refresh();
  }

  async function toggleInForza(o: Operatore) {
    setTogglingId(o.id);
    setErroreToggle("");
    try {
      const res = await fetch(`/api/admin/operatori/${o.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inForza: !o.inForza }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setOperatori(prev => prev.map(x => (x.id === o.id ? (data as Operatore) : x)));
      router.refresh();
    } catch (err) {
      setErroreToggle(err instanceof Error ? err.message : "Errore aggiornamento");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: "#e5e4e0" }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold" style={{ color: "var(--color-black)" }}>Personale (da Notion)</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
            Attivazione/disattivazione, anagrafica e nuovi operatori — mai una cancellazione, &quot;rimuovere&quot; significa disattivare (In Forza → No).
          </p>
        </div>
        <button
          onClick={() => setFormAperto("nuovo")}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white whitespace-nowrap"
          style={{ background: "var(--color-primary)" }}
        >
          + Nuovo operatore
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: "#F5F2EE", color: "var(--color-black)" }}>
          Totale: {operatori.length}
        </div>
        <div className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: "#F0FDF4", color: "#166534" }}>
          In forza: {inForza}
        </div>
        <div className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: "#EFF6FF", color: "#1D4ED8" }}>
          Interni (Modar): {interni}
        </div>
        <div className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: "#FEF9C3", color: "#92400E" }}>
          Esterni: {esterni}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {perReparto.map(([reparto, c]) => (
          <div key={reparto} className="rounded-lg px-2.5 py-1.5 text-sm font-medium" style={{ background: "#F5F2EE", color: "var(--color-black)" }}>
            {reparto}: {c.totale} <span style={{ color: "var(--color-grey-mid)" }}>({c.interni} int - {c.esterni} est)</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text" className={inputCls} style={{ minWidth: 220 }}
          placeholder="Cerca nome, matricola, reparto, azienda…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--color-grey-mid)" }}>
          <input type="checkbox" checked={soloInForza} onChange={e => setSoloInForza(e.target.checked)} className="w-3.5 h-3.5 accent-orange-500" />
          Solo in forza
        </label>
        <span className="text-sm" style={{ color: "var(--color-grey-mid)" }}>{filtrati.length} risultati</span>
        {erroreToggle && <span className="text-sm font-medium" style={{ color: "#991B1B" }}>{erroreToggle}</span>}
      </div>

      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
        <table className="text-base w-full">
          <thead>
            <tr className="border-b text-sm font-semibold uppercase" style={{ borderColor: "#e5e4e0", color: "var(--color-grey-mid)" }}>
              <th className="text-left px-3 py-2">Matricola</th>
              <th className="text-left px-3 py-2">Cognome Nome</th>
              <th className="text-left px-3 py-2">Reparto</th>
              <th className="text-left px-3 py-2">Tipo</th>
              <th className="text-left px-3 py-2">Azienda</th>
              <th className="text-center px-3 py-2">In forza</th>
              <th className="text-right px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtrati.map(o => (
              <tr key={o.id} className="border-b last:border-0" style={{ borderColor: "#f0ece5" }}>
                <td className="px-3 py-2 font-mono text-sm">{o.matricola}</td>
                <td className="px-3 py-2 font-medium">{o.cognome} {o.nome}</td>
                <td className="px-3 py-2 text-sm" style={{ color: "var(--color-grey-mid)" }}>{o.reparto || "—"}</td>
                <td className="px-3 py-2 text-sm">
                  <span
                    className="px-2 py-0.5 rounded-full font-semibold"
                    style={o.tipo === "Modar" ? { background: "#EFF6FF", color: "#1D4ED8" } : { background: "#FEF9C3", color: "#92400E" }}
                  >
                    {o.tipo === "Modar" ? "Interno" : o.tipo || "—"}
                  </span>
                </td>
                <td className="px-3 py-2 text-sm" style={{ color: "var(--color-grey-mid)" }}>{o.azienda || "—"}</td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => toggleInForza(o)}
                    disabled={togglingId === o.id}
                    className="text-sm font-semibold disabled:opacity-50"
                    style={{ color: o.inForza ? "#166534" : "#991B1B" }}
                    title={o.inForza ? "Clic per disattivare" : "Clic per riattivare"}
                  >
                    {togglingId === o.id ? "…" : o.inForza ? "Sì" : "No"}
                  </button>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => setFormAperto(o)}
                    className="text-sm font-medium px-2 py-1 rounded hover:bg-gray-100"
                    style={{ color: "var(--color-grey-mid)" }}
                  >
                    Modifica
                  </button>
                </td>
              </tr>
            ))}
            {filtrati.length === 0 && (
              <tr><td colSpan={7} className="text-center py-6 text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessun operatore trovato</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {formAperto && (
        <FormOperatore
          operatore={formAperto === "nuovo" ? undefined : formAperto}
          repartiSuggeriti={repartiSuggeriti}
          aziendeSuggerite={aziendeSuggerite}
          onClose={() => setFormAperto(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
