"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PatternCiclo } from "@/lib/patternCicloRepository";

const inputCls = "rounded-lg border px-2 py-1.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

export default function TabellaPatternCiclo({ patternIniziali }: { patternIniziali: PatternCiclo[] }) {
  const router = useRouter();
  const [nomeNuovo, setNomeNuovo] = useState("");
  const [creando, setCreando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [attivi, setAttivi] = useState<Record<string, boolean>>(
    Object.fromEntries(patternIniziali.map(p => [p.id, p.attivo]))
  );
  const [salvandoAttivo, setSalvandoAttivo] = useState<string | null>(null);

  async function creaPattern() {
    if (!nomeNuovo.trim()) return;
    setCreando(true);
    setErrore(null);
    try {
      const res = await fetch("/api/admin/pattern-ciclo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nomeNuovo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      router.push(`/admin/pattern-ciclo/${data.id}`);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore creazione pattern");
    } finally {
      setCreando(false);
    }
  }

  async function toggleAttivo(p: PatternCiclo) {
    const nuovoValore = !attivi[p.id];
    setSalvandoAttivo(p.id);
    try {
      const res = await fetch(`/api/admin/pattern-ciclo/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: p.nome, attivo: nuovoValore }),
      });
      if (!res.ok) throw new Error();
      setAttivi(prev => ({ ...prev, [p.id]: nuovoValore }));
      router.refresh();
    } catch {
      setErrore(`Errore aggiornamento "${p.nome}"`);
    } finally {
      setSalvandoAttivo(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
        <table className="w-full text-base" style={{ minWidth: 600 }}>
          <thead>
            <tr className="border-b text-sm font-semibold uppercase tracking-wide" style={{ borderColor: "#e5e4e0", color: "var(--color-grey-mid)" }}>
              <th className="text-left px-4 py-3">Pattern</th>
              <th className="text-left px-2 py-3">N. fasi</th>
              <th className="text-left px-2 py-3" title="Articoli con questo pattern assegnato">N. articoli</th>
              <th className="text-center px-2 py-3">Attivo</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {patternIniziali.map(p => (
              <tr key={p.id} className="border-b last:border-0" style={{ borderColor: "#f0ece5" }}>
                <td className="px-4 py-2 font-semibold" style={{ color: "var(--color-black)" }}>{p.nome}</td>
                <td className="px-2 py-2">{p.nFasi}</td>
                <td className="px-2 py-2">{p.nArticoli}</td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={attivi[p.id]}
                    disabled={salvandoAttivo === p.id}
                    onChange={() => toggleAttivo(p)}
                  />
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <Link
                    href={`/admin/pattern-ciclo/${p.id}`}
                    className="px-3 py-1.5 text-sm font-semibold rounded-lg"
                    style={{ border: "1px solid #e5e4e0", color: "var(--color-black)" }}
                  >
                    Apri
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text" className={inputCls} style={{ width: 280 }}
          placeholder="Nome nuovo pattern (es. Solo Verniciatura)"
          value={nomeNuovo} onChange={e => setNomeNuovo(e.target.value)}
        />
        <button
          onClick={creaPattern}
          disabled={!nomeNuovo.trim() || creando}
          className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
          style={{ background: "var(--color-primary)" }}
        >
          {creando ? "Creo…" : "Nuovo pattern"}
        </button>
      </div>
      {errore && <p className="text-sm font-medium" style={{ color: "#991B1B" }}>{errore}</p>}
    </div>
  );
}
