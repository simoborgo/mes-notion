"use client";

import { useEffect, useState } from "react";

interface RigaArticolo {
  codiceArticolo: string | null;
  numeroScheda: string | null;
  ore: number;
  oreRifacimento: number;
}

interface Risultato {
  totali: { oreTotali: number; oreRifacimento: number; costoTotale: number };
  perArticolo: RigaArticolo[];
}

export default function VistaStoricoArticolo() {
  const [risultato, setRisultato] = useState<Risultato | null>(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ore/storico-articolo")
      .then(async r => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error ?? `Errore ${r.status}`);
        return json;
      })
      .then(setRisultato)
      .catch(e => setErrore(e instanceof Error ? e.message : "Errore caricamento"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</p>;

  if (errore) {
    return (
      <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}>
        {errore}
      </div>
    );
  }

  if (!risultato) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3" style={{ borderColor: "#e5e4e0" }}>
          <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-grey-mid)" }}>Ore totali</div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-black)" }}>{risultato.totali.oreTotali.toFixed(1)}h</div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "#e5e4e0" }}>
          <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-grey-mid)" }}>Ore rifacimento</div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: "#991B1B" }}>{risultato.totali.oreRifacimento.toFixed(1)}h</div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "#e5e4e0" }}>
          <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-grey-mid)" }}>Costo totale</div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-black)" }}>€{risultato.totali.costoTotale.toFixed(0)}</div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-grey-mid)" }}>Per codice articolo</h3>
        {risultato.perArticolo.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--color-grey-mid)" }}>Nessuna ora registrata sugli ODP attivi</p>
        ) : (
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: "#e5e4e0" }}>
            {risultato.perArticolo.map((r, i) => {
              const nonClassificato = !r.codiceArticolo;
              const pct = risultato.totali.oreTotali > 0 ? (r.ore / risultato.totali.oreTotali) * 100 : 0;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-2 text-sm border-b last:border-0"
                  style={{ borderColor: "#f0efec", background: nonClassificato ? "#FFFBEB" : "transparent" }}
                >
                  <div className="min-w-0">
                    <span className="font-semibold" style={{ color: nonClassificato ? "#92400E" : "var(--color-black)" }}>
                      {nonClassificato ? `NON CLASSIFICATO — ${r.numeroScheda}` : r.codiceArticolo}
                    </span>
                    <span className="ml-2 text-xs" style={{ color: "var(--color-grey-mid)" }}>{pct.toFixed(0)}%</span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="font-semibold tabular-nums">{r.ore.toFixed(1)}h</span>
                    {r.oreRifacimento > 0 && (
                      <span className="ml-2 text-xs font-medium tabular-nums" style={{ color: "#991B1B" }}>({r.oreRifacimento.toFixed(1)}h rif.)</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
