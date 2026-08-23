"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ArticoloConPattern } from "@/lib/articoliRepository";
import type { PatternCiclo } from "@/lib/patternCicloRepository";

const selectCls = "rounded-lg border px-2 py-1.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 w-full";

export default function TabellaArticoli({ articoliIniziali, pattern }: { articoliIniziali: ArticoloConPattern[]; pattern: PatternCiclo[] }) {
  const router = useRouter();
  const [scelte, setScelte] = useState<Record<string, string>>(
    Object.fromEntries(articoliIniziali.map(a => [a.codiceArticolo, a.patternId ?? ""]))
  );
  const [salvando, setSalvando] = useState<string | null>(null);
  const [errori, setErrori] = useState<Record<string, string>>({});
  const [salvati, setSalvati] = useState<Record<string, boolean>>({});

  async function salva(codiceArticolo: string) {
    setSalvando(codiceArticolo);
    setErrori(prev => ({ ...prev, [codiceArticolo]: "" }));
    try {
      const res = await fetch("/api/admin/articoli", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codiceArticolo, patternId: scelte[codiceArticolo] || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setSalvati(prev => ({ ...prev, [codiceArticolo]: true }));
      router.refresh();
    } catch (e) {
      setErrori(prev => ({ ...prev, [codiceArticolo]: e instanceof Error ? e.message : "Errore salvataggio" }));
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
      <table className="w-full text-base" style={{ minWidth: 780 }}>
        <thead>
          <tr className="border-b text-sm font-semibold uppercase tracking-wide" style={{ borderColor: "#e5e4e0", color: "var(--color-grey-mid)" }}>
            <th className="text-left px-4 py-3">Codice articolo</th>
            <th className="text-left px-2 py-3">Descrizione</th>
            <th className="text-left px-2 py-3" title="Oggi sempre vuota — nessun articolo ha una categoria assegnata">Categoria</th>
            <th className="text-left px-2 py-3">Pattern ciclo</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {articoliIniziali.map(a => (
            <tr key={a.codiceArticolo} className="border-b last:border-0" style={{ borderColor: "#f0ece5" }}>
              <td className="px-4 py-2 font-semibold" style={{ color: "var(--color-black)" }}>{a.codiceArticolo}</td>
              <td className="px-2 py-2 text-sm">{a.descrizione}</td>
              <td className="px-2 py-2 text-sm" style={{ color: "var(--color-grey-mid)" }}>{a.categoria ?? "—"}</td>
              <td className="px-2 py-2">
                <select className={selectCls} value={scelte[a.codiceArticolo]} onChange={e => setScelte(prev => ({ ...prev, [a.codiceArticolo]: e.target.value }))}>
                  <option value="">— nessuno —</option>
                  {pattern.map(p => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                <button
                  onClick={() => salva(a.codiceArticolo)}
                  disabled={salvando === a.codiceArticolo}
                  className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
                  style={{ background: "var(--color-primary)" }}
                >
                  {salvando === a.codiceArticolo ? "…" : salvati[a.codiceArticolo] ? "Salvato ✓" : "Salva"}
                </button>
                {errori[a.codiceArticolo] && <p className="text-sm font-medium mt-1" style={{ color: "#991B1B" }}>{errori[a.codiceArticolo]}</p>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
