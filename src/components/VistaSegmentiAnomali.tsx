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
  cognome: string | null;
  nome: string | null;
  reparto: string | null;
  numeroScheda: string | null;
}

function fmtDataOra(iso: string) {
  return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function VistaSegmentiAnomali() {
  const [segmenti, setSegmenti] = useState<Segmento[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [rimuovendo, setRimuovendo] = useState<string | null>(null);

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

  async function rimuovi(id: string) {
    setRimuovendo(id);
    setErrore(null);
    try {
      const res = await fetch(`/api/ore/segmenti-anomali/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Errore rimozione");
      setSegmenti(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore rimozione");
    } finally {
      setRimuovendo(null);
    }
  }

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
                  <span className="font-semibold" style={{ color: "var(--color-black)" }}>
                    {s.cognome || s.nome ? `${s.cognome ?? ""} ${s.nome ?? ""}`.trim() : s.matricola}
                  </span>
                  {s.reparto && (
                    <span className="text-xs font-semibold ml-2 px-2 py-0.5 rounded-full" style={{ background: "#EFF6FF", color: "#1D4ED8" }}>
                      {s.reparto}
                    </span>
                  )}
                  <span className="text-sm ml-2" style={{ color: "var(--color-grey-mid)" }}>
                    {s.odp}{s.numeroScheda ? ` — ${s.numeroScheda}` : ""}{s.rif ? " · rifacimento" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#92400E" }}>
                    {s.ore}h sommate (limitate)
                  </span>
                  <button
                    onClick={() => rimuovi(s.id)}
                    disabled={rimuovendo === s.id}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg border hover:bg-white disabled:opacity-50"
                    style={{ borderColor: "#d1d5db", color: "var(--color-grey-mid)" }}
                  >
                    {rimuovendo === s.id ? "…" : "Rimuovi dalla lista"}
                  </button>
                </div>
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
