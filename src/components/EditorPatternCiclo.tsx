"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PatternCiclo, PatternCicloFase } from "@/lib/patternCicloRepository";
import type { Reparto } from "@/lib/repartiRepository";

const inputCls = "rounded-lg border px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

// Unica condizione oggi riconosciuta dal motore (generaFasiPerScheda, schedeFasiRepository.ts)
// — un testo libero rischierebbe un refuso incluso silenziosamente per default.
const CONDIZIONI = [
  { value: "programma_cnc_non_esistente", label: "Programma CNC non esistente" },
];

interface RigaFase {
  repartoId: string;
  ordine: string;
  sottoFase: string;
  condizionale: boolean;
  condizione: string;
  parallellizzabile: boolean;
  tempoAttrezzaggioOre: string;
}

function toRiga(f: PatternCicloFase): RigaFase {
  return {
    repartoId: f.repartoId,
    ordine: String(f.ordine),
    sottoFase: f.sottoFase ?? "",
    condizionale: f.condizionale,
    condizione: f.condizione ?? "",
    parallellizzabile: f.parallellizzabile,
    tempoAttrezzaggioOre: f.tempoAttrezzaggioOre != null ? String(f.tempoAttrezzaggioOre) : "",
  };
}

function corpoFase(r: RigaFase) {
  return {
    repartoId: r.repartoId,
    ordine: Number(r.ordine),
    sottoFase: r.sottoFase || null,
    condizionale: r.condizionale,
    condizione: r.condizionale ? (r.condizione || null) : null,
    parallellizzabile: r.parallellizzabile,
    tempoAttrezzaggioOre: r.tempoAttrezzaggioOre || null,
  };
}

export default function EditorPatternCiclo({ pattern, fasiIniziali, reparti }: {
  pattern: PatternCiclo; fasiIniziali: PatternCicloFase[]; reparti: Reparto[];
}) {
  const router = useRouter();
  const [nome, setNome] = useState(pattern.nome);
  const [attivo, setAttivo] = useState(pattern.attivo);
  const [salvandoTestata, setSalvandoTestata] = useState(false);
  const [erroreTestata, setErroreTestata] = useState<string | null>(null);

  const [fasi, setFasi] = useState<PatternCicloFase[]>(fasiIniziali);
  const [righe, setRighe] = useState<Record<string, RigaFase>>(
    Object.fromEntries(fasiIniziali.map(f => [f.id, toRiga(f)]))
  );
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [erroriRiga, setErroriRiga] = useState<Record<string, string>>({});
  const [aggiungendo, setAggiungendo] = useState(false);

  function setCampo<K extends keyof RigaFase>(id: string, campo: K, valore: RigaFase[K]) {
    setRighe(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valore } }));
  }

  async function salvaTestata() {
    setSalvandoTestata(true);
    setErroreTestata(null);
    try {
      const res = await fetch(`/api/admin/pattern-ciclo/${pattern.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, attivo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      router.refresh();
    } catch (e) {
      setErroreTestata(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSalvandoTestata(false);
    }
  }

  async function salvaRiga(id: string) {
    setSalvandoId(id);
    setErroriRiga(prev => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/admin/pattern-ciclo/${pattern.id}/fasi/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoFase(righe[id])),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setFasi(prev => prev.map(f => f.id === id ? data : f).sort((a, b) => a.ordine - b.ordine));
    } catch (e) {
      setErroriRiga(prev => ({ ...prev, [id]: e instanceof Error ? e.message : "Errore salvataggio" }));
    } finally {
      setSalvandoId(null);
    }
  }

  async function eliminaRiga(id: string) {
    setSalvandoId(id);
    setErroriRiga(prev => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/admin/pattern-ciclo/${pattern.id}/fasi/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setFasi(prev => prev.filter(f => f.id !== id));
      setRighe(prev => {
        const resto = { ...prev };
        delete resto[id];
        return resto;
      });
    } catch (e) {
      setErroriRiga(prev => ({ ...prev, [id]: e instanceof Error ? e.message : "Errore eliminazione" }));
    } finally {
      setSalvandoId(null);
    }
  }

  async function aggiungiFase() {
    setAggiungendo(true);
    try {
      const ordineMax = fasi.reduce((max, f) => Math.max(max, f.ordine), 0);
      const res = await fetch(`/api/admin/pattern-ciclo/${pattern.id}/fasi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repartoId: reparti[0]?.id, ordine: ordineMax + 10, sottoFase: null,
          condizionale: false, condizione: null, parallellizzabile: false, tempoAttrezzaggioOre: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setFasi(prev => [...prev, data]);
      setRighe(prev => ({ ...prev, [data.id]: toRiga(data) }));
    } finally {
      setAggiungendo(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Testata pattern */}
      <div className="rounded-xl border p-4 flex flex-wrap items-end gap-3" style={{ borderColor: "#e5e4e0" }}>
        <div>
          <label className="text-xs block mb-1" style={{ color: "var(--color-grey-mid)" }}>Nome</label>
          <input type="text" className={inputCls} style={{ width: 280 }} value={nome} onChange={e => setNome(e.target.value)} />
        </div>
        <label className="flex items-center gap-1.5 text-sm pb-1.5" style={{ color: "var(--color-grey-mid)" }}>
          <input type="checkbox" checked={attivo} onChange={e => setAttivo(e.target.checked)} />
          Attivo (selezionabile per nuove fasi)
        </label>
        <button
          onClick={salvaTestata}
          disabled={salvandoTestata || !nome.trim()}
          className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
          style={{ background: "var(--color-primary)" }}
        >
          {salvandoTestata ? "…" : "Salva"}
        </button>
        {erroreTestata && <p className="text-sm font-medium w-full" style={{ color: "#991B1B" }}>{erroreTestata}</p>}
      </div>

      {/* Fasi del pattern */}
      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
        <table className="w-full text-sm" style={{ minWidth: 1100 }}>
          <thead>
            <tr className="border-b text-xs font-semibold uppercase tracking-wide" style={{ borderColor: "#e5e4e0", color: "var(--color-grey-mid)" }}>
              <th className="text-left px-3 py-2">Ordine</th>
              <th className="text-left px-2 py-2">Reparto</th>
              <th className="text-left px-2 py-2">Sotto-fase</th>
              <th className="text-center px-2 py-2">Condizionale</th>
              <th className="text-left px-2 py-2">Condizione</th>
              <th className="text-center px-2 py-2">Parallelizzabile</th>
              <th className="text-left px-2 py-2" title="Costo di cambio lavorazione sulla stessa corsia (spacchettamento lotti — Fase 8)">Attrezzaggio (ore)</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {fasi.map(f => {
              const r = righe[f.id];
              if (!r) return null;
              return (
                <tr key={f.id} className="border-b last:border-0" style={{ borderColor: "#f0ece5" }}>
                  <td className="px-3 py-2"><input type="number" step="1" className={inputCls} style={{ width: 70 }} value={r.ordine} onChange={e => setCampo(f.id, "ordine", e.target.value)} /></td>
                  <td className="px-2 py-2">
                    <select className={inputCls} style={{ width: 170 }} value={r.repartoId} onChange={e => setCampo(f.id, "repartoId", e.target.value)}>
                      {reparti.map(rep => <option key={rep.id} value={rep.id}>{rep.nome}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2"><input type="text" className={inputCls} style={{ width: 140 }} value={r.sottoFase} onChange={e => setCampo(f.id, "sottoFase", e.target.value)} /></td>
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" checked={r.condizionale} onChange={e => setCampo(f.id, "condizionale", e.target.checked)} />
                  </td>
                  <td className="px-2 py-2">
                    <select className={inputCls} style={{ width: 200 }} value={r.condizione} disabled={!r.condizionale} onChange={e => setCampo(f.id, "condizione", e.target.value)}>
                      <option value="">— nessuna —</option>
                      {CONDIZIONI.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" checked={r.parallellizzabile} onChange={e => setCampo(f.id, "parallellizzabile", e.target.checked)} />
                  </td>
                  <td className="px-2 py-2"><input type="number" min="0" step="0.5" className={inputCls} style={{ width: 90 }} value={r.tempoAttrezzaggioOre} onChange={e => setCampo(f.id, "tempoAttrezzaggioOre", e.target.value)} /></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="flex gap-1.5 justify-end">
                      <button
                        onClick={() => salvaRiga(f.id)}
                        disabled={salvandoId === f.id}
                        className="px-2 py-1 text-xs font-semibold rounded-lg disabled:opacity-60"
                        style={{ border: "1px solid #e5e4e0", color: "var(--color-black)" }}
                      >
                        {salvandoId === f.id ? "…" : "Salva"}
                      </button>
                      <button
                        onClick={() => eliminaRiga(f.id)}
                        disabled={salvandoId === f.id}
                        className="px-2 py-1 text-xs font-semibold rounded-lg disabled:opacity-60"
                        style={{ border: "1px solid #e5e4e0", color: "#991B1B" }}
                      >
                        Elimina
                      </button>
                    </div>
                    {erroriRiga[f.id] && <p className="text-xs font-medium mt-1" style={{ color: "#991B1B" }}>{erroriRiga[f.id]}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        onClick={aggiungiFase}
        disabled={aggiungendo || reparti.length === 0}
        className="px-3 py-1.5 text-sm font-semibold rounded-lg disabled:opacity-60"
        style={{ border: "1px solid #e5e4e0", color: "var(--color-black)" }}
      >
        {aggiungendo ? "…" : "+ Aggiungi fase"}
      </button>
    </div>
  );
}
