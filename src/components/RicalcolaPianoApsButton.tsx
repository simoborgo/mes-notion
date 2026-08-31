"use client";

import { useState } from "react";

interface Esito { fasiPianificate: number; odpARischio: number }

// `compact`: variante senza il box con bordo e la descrizione estesa, per contesti dove il
// bottone va inserito in una toolbar già affollata (es. Gantt APS) invece che come sezione
// a sé stante (pagina Admin > Reparti, uso originale).
export default function RicalcolaPianoApsButton({ compact = false, onSuccess }: { compact?: boolean; onSuccess?: (esito: Esito) => void }) {
  const [stato, setStato] = useState<"idle" | "in-corso" | "errore">("idle");
  const [esito, setEsito] = useState<Esito | null>(null);
  const [errore, setErrore] = useState("");

  async function ricalcola() {
    setStato("in-corso");
    setErrore("");
    setEsito(null);
    try {
      const res = await fetch("/api/aps/ricalcola", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setEsito(data);
      setStato("idle");
      onSuccess?.(data);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore ricalcolo");
      setStato("errore");
    }
  }

  const bottone = (
    <button
      onClick={ricalcola}
      disabled={stato === "in-corso"}
      className={compact ? "px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-60 whitespace-nowrap" : "px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60"}
      style={{ background: "var(--color-primary)" }}
    >
      {stato === "in-corso" ? "Ricalcolo in corso…" : "Ricalcola piano APS"}
    </button>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {bottone}
        {esito && (
          <span className="text-xs font-medium" style={{ color: "var(--color-black)" }}>
            {esito.fasiPianificate} fasi pianificate, {esito.odpARischio} a rischio
          </span>
        )}
        {errore && <span className="text-xs font-medium" style={{ color: "#991B1B" }}>{errore}</span>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "#e5e4e0" }}>
      <div className="flex items-center gap-3">
        {bottone}
        <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
          Ripianifica tutte le fasi &quot;Da iniziare&quot; su tutti gli ODP — non tocca le fasi
          già avviate o completate.
        </p>
      </div>
      {esito && (
        <p className="text-sm font-medium" style={{ color: "var(--color-black)" }}>
          {esito.fasiPianificate} fasi pianificate, {esito.odpARischio} ODP a rischio consegna.
        </p>
      )}
      {errore && <p className="text-sm font-medium" style={{ color: "#991B1B" }}>{errore}</p>}
    </div>
  );
}
