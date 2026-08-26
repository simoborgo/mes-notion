"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Righe a testo libero della distinta Kit Ferramenta non hanno un articolo da scaricare — questo
// sostituisce il pulsante "Scarica" (che punterebbe a un articolo inesistente) con una conferma
// manuale, senza alcun movimento di magazzino. Toggle, non one-way: un segno per sbaglio si toglie.
export default function PreparataToggle({ schedaId, rigaId, preparata }: { schedaId: string; rigaId: string; preparata: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function toggle() {
    setSaving(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/ferramenta/kit/${schedaId}/righe/${rigaId}/preparata`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preparata: !preparata }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore salvataggio");
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap border disabled:opacity-60"
        style={preparata
          ? { color: "#166534", background: "#F0FDF4", borderColor: "#86EFAC" }
          : { color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}
      >
        {saving ? "…" : preparata ? "✓ Preparato" : "Preparato"}
      </button>
      {errore && <p className="text-xs" style={{ color: "#991B1B" }}>{errore}</p>}
    </div>
  );
}
