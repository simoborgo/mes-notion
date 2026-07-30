"use client";

import { useState } from "react";
import type { Scheda, Ritiro } from "@/lib/types";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

const STATO_RITIRO_COLOR: Record<string, { bg: string; fg: string }> = {
  "Da Fare": { bg: "#FEF3C7", fg: "#92400E" },
  "In corso": { bg: "#DBEAFE", fg: "#1E40AF" },
  "Fatto": { bg: "#D1FAE5", fg: "#065F46" },
};

export default function RientroQualitaCard({
  scheda, ritiriCollegati = [], onInserisciRitiro, onDone,
}: {
  scheda: Scheda;
  ritiriCollegati?: Ritiro[];
  onInserisciRitiro?: () => void;
  onDone?: () => void;
}) {
  const [stato, setStato] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function handleConferma() {
    if (stato === "loading" || stato === "done") return;
    setStato("loading");
    setError("");
    try {
      const res = await fetch(`/api/schede/${scheda.id}/rientro`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error ?? `Errore ${res.status}`);
      setStato("done");
      onDone?.();
    } catch (e) {
      setStato("error");
      setError(e instanceof Error ? e.message : "Errore durante il salvataggio.");
    }
  }

  if (stato === "done") {
    return (
      <div className="rounded-xl border-2 p-4 flex items-center gap-3" style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}>
        <span className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 36, height: 36, background: "#D1FAE5" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        <div>
          <p className="font-semibold text-sm" style={{ color: "#14532D" }}>Rientro confermato</p>
          <p className="text-xs mt-0.5" style={{ color: "#166534" }}>{scheda.odp} — {scheda.numeroScheda}</p>
        </div>
      </div>
    );
  }

  const senzaRitiro = ritiriCollegati.length === 0;

  return (
    <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: senzaRitiro ? "#FCA5A5" : "#e5e4e0", background: "white" }}>
      <div>
        <p className="font-bold text-lg" style={{ color: "var(--color-black)" }}>{scheda.odp || "—"}</p>
        {scheda.numeroScheda && (
          <p className="text-sm font-medium" style={{ color: "var(--color-black)" }}>{scheda.numeroScheda}</p>
        )}
      </div>
      <div className="text-sm space-y-1">
        {scheda.fornitore && (
          <p><span style={{ color: "var(--color-grey-mid)" }}>Fornitore: </span><strong>{scheda.fornitore}</strong></p>
        )}
        {scheda.clienteInfo && (
          <p style={{ color: "var(--color-grey-mid)" }}>{scheda.clienteInfo}</p>
        )}
      </div>

      {senzaRitiro ? (
        <div className="rounded-lg px-3 py-2.5 space-y-2" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <p className="text-xs font-semibold" style={{ color: "#991B1B" }}>⚠ Nessun ritiro concordato</p>
          {onInserisciRitiro && (
            <button
              type="button"
              onClick={onInserisciRitiro}
              className="w-full py-2 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: "#991B1B" }}
            >
              Inserisci un ritiro
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {ritiriCollegati.map((r) => {
            const colore = STATO_RITIRO_COLOR[r.stato];
            return (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ background: "#faf9f7", border: "1px solid #ebe9e5" }}>
                <div className="text-xs">
                  <span className="font-semibold" style={{ color: "var(--color-black)" }}>{r.tipoMovimento || "Movimento"}</span>
                  <span style={{ color: "var(--color-grey-mid)" }}> — {fmt(r.dataTrasporto)}</span>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                  style={{ background: colore?.bg ?? "#F3F4F6", color: colore?.fg ?? "#374151" }}
                >
                  {r.stato || "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="rounded-md border px-3 py-2" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
          <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{error}</p>
        </div>
      )}

      <button
        onClick={handleConferma}
        disabled={stato === "loading"}
        className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
        style={{ background: "#166534" }}
      >
        {stato === "loading" && (
          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        )}
        {stato === "loading" ? "Conferma in corso…" : "✓ Conferma controllo qualità e segna rientrata"}
      </button>
    </div>
  );
}
