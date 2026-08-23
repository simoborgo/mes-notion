"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Reparto } from "@/lib/repartiRepository";

const inputCls = "rounded-lg border px-2 py-1.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 w-full";

interface RigaState {
  nome: string;
  ordinePipeline: string;
  capacitaSett: string;
  nRisorseParallele: string;
  wipMax: string;
  tamburo: boolean;
  tbd: boolean;
}

function toRigaState(r: Reparto): RigaState {
  return {
    nome: r.nome,
    ordinePipeline: String(r.ordinePipeline),
    capacitaSett: r.capacitaSett != null ? String(r.capacitaSett) : "",
    nRisorseParallele: r.nRisorseParallele != null ? String(r.nRisorseParallele) : "",
    wipMax: r.wipMax != null ? String(r.wipMax) : "",
    tamburo: r.tamburo,
    tbd: r.tbd,
  };
}

export default function TabellaReparti({ repartiIniziali }: { repartiIniziali: Reparto[] }) {
  const router = useRouter();
  const [righe, setRighe] = useState<Record<string, RigaState>>(
    Object.fromEntries(repartiIniziali.map(r => [r.id, toRigaState(r)]))
  );
  const [salvando, setSalvando] = useState<string | null>(null);
  const [errori, setErrori] = useState<Record<string, string>>({});
  const [salvati, setSalvati] = useState<Record<string, boolean>>({});

  function setCampo<K extends keyof RigaState>(id: string, campo: K, valore: RigaState[K]) {
    setRighe(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valore } }));
    setSalvati(prev => ({ ...prev, [id]: false }));
  }

  async function salva(id: string) {
    const r = righe[id];
    setSalvando(id);
    setErrori(prev => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch("/api/admin/reparti", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          nome: r.nome,
          ordinePipeline: Number(r.ordinePipeline),
          capacitaSett: r.capacitaSett || null,
          nRisorseParallele: r.nRisorseParallele || null,
          wipMax: r.wipMax || null,
          tamburo: r.tamburo,
          tbd: r.tbd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setSalvati(prev => ({ ...prev, [id]: true }));
      router.refresh();
    } catch (e) {
      setErrori(prev => ({ ...prev, [id]: e instanceof Error ? e.message : "Errore salvataggio" }));
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
      <table className="w-full text-base" style={{ minWidth: 1040 }}>
        <thead>
          <tr className="border-b text-sm font-semibold uppercase tracking-wide" style={{ borderColor: "#e5e4e0", color: "var(--color-grey-mid)" }}>
            <th className="text-left px-4 py-3">Reparto</th>
            <th className="text-left px-2 py-3" title="Posizione nella pipeline — determina l'ordine di attraversamento e la riga nel Gantt">Ordine</th>
            <th className="text-left px-2 py-3">Tipo</th>
            <th className="text-left px-2 py-3">Capacità (ore/sett.)</th>
            <th className="text-left px-2 py-3" title="Numero di macchine/postazioni fisiche — solo reparti a corsie">N. corsie</th>
            <th className="text-left px-2 py-3" title="Tetto ODP contemporaneamente in lavorazione (CONWIP) — solo reparti a monte ore">WIP max (ODP)</th>
            <th className="text-center px-2 py-3">Tamburo</th>
            <th className="text-center px-2 py-3">TBD</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {repartiIniziali.map(rep => {
            const r = righe[rep.id];
            return (
              <tr key={rep.id} className="border-b last:border-0" style={{ borderColor: "#f0ece5" }}>
                <td className="px-4 py-2 font-semibold" style={{ color: "var(--color-black)" }}>
                  <input type="text" className={inputCls} style={{ width: 180 }} value={r.nome} onChange={e => setCampo(rep.id, "nome", e.target.value)} />
                </td>
                <td className="px-2 py-2"><input type="number" step="1" className={inputCls} style={{ width: 70 }} value={r.ordinePipeline} onChange={e => setCampo(rep.id, "ordinePipeline", e.target.value)} /></td>
                <td className="px-2 py-2 text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  {rep.tipoCapacita === "corsie" ? "Corsie" : "Monte ore"}
                </td>
                <td className="px-2 py-2"><input type="number" min="0" step="0.5" className={inputCls} style={{ width: 90 }} value={r.capacitaSett} onChange={e => setCampo(rep.id, "capacitaSett", e.target.value)} /></td>
                <td className="px-2 py-2">
                  {rep.tipoCapacita === "corsie" ? (
                    <input type="number" min="0" step="1" className={inputCls} style={{ width: 80 }} value={r.nRisorseParallele} onChange={e => setCampo(rep.id, "nRisorseParallele", e.target.value)} />
                  ) : (
                    <span style={{ color: "var(--color-grey-mid)" }}>—</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {rep.tipoCapacita === "monte_ore" ? (
                    <input type="number" min="0" step="1" className={inputCls} style={{ width: 80 }} value={r.wipMax} onChange={e => setCampo(rep.id, "wipMax", e.target.value)} />
                  ) : (
                    <span style={{ color: "var(--color-grey-mid)" }}>—</span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  <input type="checkbox" checked={r.tamburo} onChange={e => setCampo(rep.id, "tamburo", e.target.checked)} />
                </td>
                <td className="px-2 py-2 text-center">
                  <input type="checkbox" checked={r.tbd} onChange={e => setCampo(rep.id, "tbd", e.target.checked)} />
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => salva(rep.id)}
                    disabled={salvando === rep.id}
                    className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
                    style={{ background: "var(--color-primary)" }}
                  >
                    {salvando === rep.id ? "…" : salvati[rep.id] ? "Salvato ✓" : "Salva"}
                  </button>
                  {errori[rep.id] && <p className="text-sm font-medium mt-1" style={{ color: "#991B1B" }}>{errori[rep.id]}</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
