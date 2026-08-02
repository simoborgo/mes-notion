"use client";

import { useEffect, useState } from "react";

interface Segmento {
  id: string;
  matricola: string;
  data: string;
  odp: string;
  rif: boolean;
  iniziatoAlle: string;
  chiusoAlle: string | null;
  ore: number | null;
  anomalo: boolean;
}

function fmtDataOra(iso: string) {
  return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function VistaSegmentiAnomali() {
  const [segmenti, setSegmenti] = useState<Segmento[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ore/segmenti-anomali")
      .then(async r => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        return json;
      })
      .then(setSegmenti)
      .catch(e => setErrore(e instanceof Error ? e.message : "Errore caricamento"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
        Segmenti da tablet operatore chiusi con una durata anomala (oltre soglia — probabile dimenticanza) — le ore sono comunque state limitate e sommate, verifica se vanno corrette manualmente da &quot;Oggi&quot;.
      </p>
      {errore && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}>
          {errore}
        </div>
      )}
      {segmenti.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessun segmento anomalo.</p>
      ) : (
        <div className="space-y-2">
          {segmenti.map(s => (
            <div key={s.id} className="rounded-xl border p-4" style={{ borderColor: "#FCD34D", background: "#FFFBEB" }}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="font-semibold" style={{ color: "var(--color-black)" }}>{s.matricola}</span>
                  <span className="text-sm ml-2" style={{ color: "var(--color-grey-mid)" }}>{s.odp}{s.rif ? " · rifacimento" : ""}</span>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#92400E" }}>
                  {s.ore}h sommate (limitate)
                </span>
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--color-grey-mid)" }}>
                {fmtDataOra(s.iniziatoAlle)} → {s.chiusoAlle ? fmtDataOra(s.chiusoAlle) : "…"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
