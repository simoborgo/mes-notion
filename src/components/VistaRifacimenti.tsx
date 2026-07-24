"use client";

import { useEffect, useState } from "react";

type Causale = "P" | "T" | "M" | "C";

interface Voce {
  id: string;
  data: string;
  matricola: string;
  cognome: string;
  nome: string;
  odp: string;
  ore: number;
  note: string | null;
}

const CAUSALI: { value: Causale; label: string }[] = [
  { value: "P", label: "P — Progettazione" },
  { value: "T", label: "T — Taglio/Lavorazione" },
  { value: "M", label: "M — Materiale" },
  { value: "C", label: "C — Cliente" },
];

function fmt(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("it-IT");
}

export default function VistaRifacimenti() {
  const [voci, setVoci] = useState<Voce[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  async function carica() {
    setLoading(true);
    try {
      const res = await fetch("/api/ore/rifacimenti");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setVoci(json);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carica(); }, []);

  async function classifica(id: string, causale: Causale) {
    setSalvando(id);
    setErrore(null);
    try {
      const res = await fetch(`/api/ore/registrazioni/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ causale }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setVoci(prev => prev.filter(v => v.id !== id));
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSalvando(null);
    }
  }

  if (loading) return <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
        {voci.length} rifacimento{voci.length === 1 ? "" : "i"} da classificare
      </p>
      {errore && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}>
          {errore}
        </div>
      )}
      {voci.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Tutti i rifacimenti sono classificati.</p>
      ) : (
        <div className="space-y-2">
          {voci.map(v => (
            <div key={v.id} className="rounded-xl border p-4" style={{ borderColor: "#e5e4e0" }}>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div>
                  <span className="font-semibold" style={{ color: "var(--color-black)" }}>{v.cognome} {v.nome}</span>
                  <span className="text-sm ml-2" style={{ color: "var(--color-grey-mid)" }}>{fmt(v.data)} · {v.odp} · {v.ore}h</span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {CAUSALI.map(c => (
                  <button
                    key={c.value}
                    onClick={() => classifica(v.id, c.value)}
                    disabled={salvando === v.id}
                    className="px-3 py-1.5 text-sm font-semibold rounded-lg border hover:bg-orange-50 disabled:opacity-50"
                    style={{ borderColor: "var(--color-primary)", color: "var(--color-primary)" }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
