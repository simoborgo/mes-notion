"use client";

import { useState } from "react";
import type { ParametriReparto } from "@/lib/parametriRepartoRepository";

const inputCls = "rounded-lg border px-2 py-1.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 w-full";

interface RigaState {
  nPersone: string;
  oreGiorno: string;
  pctStraordinariMax: string;
  margineSicurezzaEsterni: string;
  tariffaEsternaEurH: string;
  oreGiornoEsterno: string;
}

function toRigaState(p: ParametriReparto): RigaState {
  return {
    nPersone: String(p.nPersone),
    oreGiorno: String(p.oreGiorno),
    pctStraordinariMax: String(p.pctStraordinariMax),
    margineSicurezzaEsterni: String(p.margineSicurezzaEsterni),
    tariffaEsternaEurH: p.tariffaEsternaEurH != null ? String(p.tariffaEsternaEurH) : "",
    oreGiornoEsterno: p.oreGiornoEsterno != null ? String(p.oreGiornoEsterno) : "",
  };
}

export default function TabellaParametriReparto({ parametriIniziali }: { parametriIniziali: ParametriReparto[] }) {
  const [righe, setRighe] = useState<Record<string, RigaState>>(
    Object.fromEntries(parametriIniziali.map(p => [p.reparto, toRigaState(p)]))
  );
  const [salvando, setSalvando] = useState<string | null>(null);
  const [errori, setErrori] = useState<Record<string, string>>({});
  const [salvati, setSalvati] = useState<Record<string, boolean>>({});

  function setCampo(reparto: string, campo: keyof RigaState, valore: string) {
    setRighe(prev => ({ ...prev, [reparto]: { ...prev[reparto], [campo]: valore } }));
    setSalvati(prev => ({ ...prev, [reparto]: false }));
  }

  async function salva(reparto: string) {
    const r = righe[reparto];
    setSalvando(reparto);
    setErrori(prev => ({ ...prev, [reparto]: "" }));
    try {
      const res = await fetch("/api/admin/parametri-reparto", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reparto,
          nPersone: Number(r.nPersone),
          oreGiorno: Number(r.oreGiorno),
          pctStraordinariMax: Number(r.pctStraordinariMax),
          margineSicurezzaEsterni: Number(r.margineSicurezzaEsterni),
          tariffaEsternaEurH: r.tariffaEsternaEurH || null,
          oreGiornoEsterno: r.oreGiornoEsterno || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setSalvati(prev => ({ ...prev, [reparto]: true }));
    } catch (e) {
      setErrori(prev => ({ ...prev, [reparto]: e instanceof Error ? e.message : "Errore salvataggio" }));
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
      <table className="w-full text-base" style={{ minWidth: 820 }}>
        <thead>
          <tr className="border-b text-sm font-semibold uppercase tracking-wide" style={{ borderColor: "#e5e4e0", color: "var(--color-grey-mid)" }}>
            <th className="text-left px-4 py-3">Reparto</th>
            <th className="text-left px-2 py-3" title="Include anche gli esterni fissi già presenti nel reparto, non solo i dipendenti — il campo 'esterni' più a destra rappresenta manodopera aggiuntiva da chiamare oltre a questa squadra">N. persone</th>
            <th className="text-left px-2 py-3">Ore/giorno</th>
            <th className="text-left px-2 py-3">% Straord. max</th>
            <th className="text-left px-2 py-3">Margine esterni %</th>
            <th className="text-left px-2 py-3">Tariffa est. €/h</th>
            <th className="text-left px-2 py-3">Ore/giorno est.</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {parametriIniziali.map(p => {
            const r = righe[p.reparto];
            return (
              <tr key={p.reparto} className="border-b last:border-0" style={{ borderColor: "#f0ece5" }}>
                <td className="px-4 py-2 font-semibold" style={{ color: "var(--color-black)" }}>{p.reparto}</td>
                <td className="px-2 py-2"><input type="number" min="0" className={inputCls} style={{ width: 80 }} value={r.nPersone} onChange={e => setCampo(p.reparto, "nPersone", e.target.value)} /></td>
                <td className="px-2 py-2"><input type="number" min="0" step="0.5" className={inputCls} style={{ width: 80 }} value={r.oreGiorno} onChange={e => setCampo(p.reparto, "oreGiorno", e.target.value)} /></td>
                <td className="px-2 py-2"><input type="number" min="0" step="1" className={inputCls} style={{ width: 90 }} value={r.pctStraordinariMax} onChange={e => setCampo(p.reparto, "pctStraordinariMax", e.target.value)} /></td>
                <td className="px-2 py-2"><input type="number" min="0" step="1" className={inputCls} style={{ width: 90 }} value={r.margineSicurezzaEsterni} onChange={e => setCampo(p.reparto, "margineSicurezzaEsterni", e.target.value)} /></td>
                <td className="px-2 py-2"><input type="number" min="0" step="0.5" className={inputCls} style={{ width: 90 }} value={r.tariffaEsternaEurH} onChange={e => setCampo(p.reparto, "tariffaEsternaEurH", e.target.value)} /></td>
                <td className="px-2 py-2"><input type="number" min="0" step="0.5" className={inputCls} style={{ width: 90 }} value={r.oreGiornoEsterno} onChange={e => setCampo(p.reparto, "oreGiornoEsterno", e.target.value)} /></td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => salva(p.reparto)}
                    disabled={salvando === p.reparto}
                    className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
                    style={{ background: "var(--color-primary)" }}
                  >
                    {salvando === p.reparto ? "…" : salvati[p.reparto] ? "Salvato ✓" : "Salva"}
                  </button>
                  {errori[p.reparto] && <p className="text-sm font-medium mt-1" style={{ color: "#991B1B" }}>{errori[p.reparto]}</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
