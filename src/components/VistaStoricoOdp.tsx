"use client";

import { useState } from "react";

interface Voce {
  id: string;
  data: string;
  matricola: string;
  cognome: string;
  nome: string;
  ore: number;
  rif: boolean;
  causale: string | null;
}

function fmt(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("it-IT");
}

const inputCls = "rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

export default function VistaStoricoOdp() {
  const [odp, setOdp] = useState("");
  const [voci, setVoci] = useState<Voce[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function cerca() {
    if (!odp.trim()) return;
    setLoading(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/ore/storico-odp?odp=${encodeURIComponent(odp.trim())}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setVoci(json);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore ricerca");
    } finally {
      setLoading(false);
    }
  }

  const totaleOre = voci?.reduce((s, v) => s + v.ore, 0) ?? 0;
  const totaleRif = voci?.filter(v => v.rif).reduce((s, v) => s + v.ore, 0) ?? 0;

  // Raggruppa per operatore
  const perOperatore = voci
    ? Object.values(
        voci.reduce((acc: Record<string, { cognome: string; nome: string; ore: number }>, v) => {
          const k = v.matricola;
          if (!acc[k]) acc[k] = { cognome: v.cognome, nome: v.nome, ore: 0 };
          acc[k].ore += v.ore;
          return acc;
        }, {})
      )
    : [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          className={inputCls}
          style={{ height: 48, flex: 1, maxWidth: 320 }}
          placeholder="Numero ODP (es. MP26-051)"
          value={odp}
          onChange={e => setOdp(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") cerca(); }}
        />
        <button
          onClick={cerca}
          disabled={loading || !odp.trim()}
          className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
          style={{ background: "var(--color-primary)", height: 48 }}
        >
          {loading ? "Ricerca…" : "Cerca"}
        </button>
      </div>

      {errore && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}>
          {errore}
        </div>
      )}

      {voci && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3" style={{ borderColor: "#e5e4e0" }}>
              <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-grey-mid)" }}>Ore totali</div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-black)" }}>{totaleOre}h</div>
            </div>
            <div className="rounded-lg border p-3" style={{ borderColor: "#e5e4e0" }}>
              <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-grey-mid)" }}>Ore rifacimento</div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: "#991B1B" }}>{totaleRif}h</div>
            </div>
            <div className="rounded-lg border p-3" style={{ borderColor: "#e5e4e0" }}>
              <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-grey-mid)" }}>Costo totale</div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-black)" }}>€{(totaleOre * 41).toFixed(0)}</div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-grey-mid)" }}>Per operatore</h3>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: "#e5e4e0" }}>
              {perOperatore.map((o, i) => (
                <div key={i} className="flex justify-between px-4 py-2 text-sm border-b last:border-0" style={{ borderColor: "#f0efec" }}>
                  <span>{o.cognome} {o.nome}</span>
                  <span className="font-semibold tabular-nums">{o.ore}h</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-grey-mid)" }}>Per giorno</h3>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: "#e5e4e0" }}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold uppercase" style={{ background: "#faf9f7", color: "var(--color-grey-mid)" }}>
                    <th className="px-4 py-2">Data</th>
                    <th className="px-4 py-2">Operatore</th>
                    <th className="px-4 py-2">Ore</th>
                    <th className="px-4 py-2">RIF</th>
                  </tr>
                </thead>
                <tbody>
                  {voci.map(v => (
                    <tr key={v.id} className="border-t" style={{ borderColor: "#f0efec" }}>
                      <td className="px-4 py-2 tabular-nums">{fmt(v.data)}</td>
                      <td className="px-4 py-2">{v.cognome} {v.nome}</td>
                      <td className="px-4 py-2 tabular-nums font-semibold">{v.ore}h</td>
                      <td className="px-4 py-2">{v.rif ? `RIF${v.causale ? ` (${v.causale})` : ""}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
