"use client";

import { useEffect, useMemo, useState } from "react";
import { REPARTI_PRODUZIONE } from "@/lib/types";

interface CellaStandard {
  mediaOre: number;
  nOsservazioni: number;
  origine: "stimato" | "consuntivo";
}

interface RigaStandardArticolo {
  codiceArticolo: string;
  descrizione: string;
  perReparto: Record<string, CellaStandard>;
}

const inputCls = "rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

export default function VistaStandardArticoli() {
  const [righe, setRighe] = useState<RigaStandardArticolo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/ore/standard-articoli")
      .then(async r => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        return json;
      })
      .then(setRighe)
      .catch(e => setErrore(e instanceof Error ? e.message : "Errore caricamento"))
      .finally(() => setLoading(false));
  }, []);

  const filtrate = useMemo(() => {
    if (!righe) return [];
    const q = search.toLowerCase().trim();
    if (!q) return righe;
    return righe.filter(r => `${r.codiceArticolo} ${r.descrizione}`.toLowerCase().includes(q));
  }, [righe, search]);

  const { totaleCelle, celleConsuntivo } = useMemo(() => {
    if (!righe) return { totaleCelle: 0, celleConsuntivo: 0 };
    let tot = 0, cons = 0;
    for (const r of righe) {
      for (const c of Object.values(r.perReparto)) {
        tot++;
        if (c.origine === "consuntivo") cons++;
      }
    }
    return { totaleCelle: tot, celleConsuntivo: cons };
  }, [righe]);

  if (loading) return <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</p>;

  if (errore) {
    return (
      <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}>
        {errore}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
        Ore standard per articolo e reparto — usate dal Previsionale per stimare la capacità.
        Partono da una stima seminata una tantum (<span className="font-bold" style={{ color: "#92400E" }}>~</span>) e
        vengono sostituite automaticamente da una media reale (Welford) man mano che gli ODP di
        quell&apos;articolo vengono chiusi con ore registrate.
      </p>

      <div className="flex flex-wrap gap-3">
        <div className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: "#F5F2EE", color: "var(--color-black)" }}>
          Articoli: {righe?.length ?? 0}
        </div>
        <div className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: "#F0FDF4", color: "#166534" }}>
          Celle a consuntivo: {celleConsuntivo} / {totaleCelle} ({totaleCelle > 0 ? ((celleConsuntivo / totaleCelle) * 100).toFixed(0) : 0}%)
        </div>
      </div>

      <input
        type="text" className={inputCls} style={{ height: 44, width: "100%", maxWidth: 360 }}
        placeholder="Cerca codice o descrizione articolo…"
        value={search} onChange={e => setSearch(e.target.value)}
      />

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
        <table className="text-sm" style={{ minWidth: 900 }}>
          <thead>
            <tr className="border-b text-xs font-semibold uppercase tracking-wide" style={{ borderColor: "#e5e4e0", color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <th className="text-left px-4 py-2.5 sticky left-0" style={{ background: "#faf9f7" }}>Codice</th>
              <th className="text-left px-3 py-2.5">Descrizione</th>
              {REPARTI_PRODUZIONE.map(rep => (
                <th key={rep} className="text-right px-3 py-2.5 whitespace-nowrap">{rep}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrate.map(r => (
              <tr key={r.codiceArticolo} className="border-b last:border-0" style={{ borderColor: "#f0efec" }}>
                <td className="px-4 py-2 font-mono font-semibold sticky left-0 bg-white" style={{ color: "var(--color-black)" }}>{r.codiceArticolo}</td>
                <td className="px-3 py-2" style={{ color: "var(--color-grey-mid)" }}>{r.descrizione}</td>
                {REPARTI_PRODUZIONE.map(rep => {
                  const c = r.perReparto[rep];
                  if (!c) {
                    return <td key={rep} className="px-3 py-2 text-right" style={{ color: "#d1d5db" }}>—</td>;
                  }
                  const stimato = c.origine === "stimato";
                  return (
                    <td key={rep} className="px-3 py-2 text-right tabular-nums">
                      <span className="font-semibold" style={{ color: stimato ? "#92400E" : "var(--color-black)" }}>
                        {stimato && <span title="Basato su una stima, nessuna chiusura reale ancora">~</span>}
                        {c.mediaOre.toFixed(1)}h
                      </span>
                      {!stimato && (
                        <span className="ml-1 text-xs" style={{ color: "var(--color-grey-mid)" }}>({c.nOsservazioni})</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {filtrate.length === 0 && (
              <tr><td colSpan={2 + REPARTI_PRODUZIONE.length} className="text-center py-6 text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessun articolo trovato</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
