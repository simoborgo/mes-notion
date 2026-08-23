"use client";

import { useState } from "react";

export default function RicalcolaPianoApsButton() {
  const [stato, setStato] = useState<"idle" | "in-corso" | "errore">("idle");
  const [esito, setEsito] = useState<{ fasiPianificate: number; odpARischio: number } | null>(null);
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
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore ricalcolo");
      setStato("errore");
    }
  }

  return (
    <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "#e5e4e0" }}>
      <div className="flex items-center gap-3">
        <button
          onClick={ricalcola}
          disabled={stato === "in-corso"}
          className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
          style={{ background: "var(--color-primary)" }}
        >
          {stato === "in-corso" ? "Ricalcolo in corso…" : "Ricalcola piano APS"}
        </button>
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
