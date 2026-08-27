"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Bordo } from "@/lib/types";

export default function BordoCaricoScaricoModal({
  bordo, tipo, onClose, onSalvato,
}: {
  bordo: Bordo;
  tipo: "carico" | "scarico";
  onClose: () => void;
  // Aggiorna subito la riga in tabella (stato locale del genitore) — router.refresh() da solo
  // non basta: la tabella tiene una copia in useState per gestire anche la creazione/modifica
  // anagrafica, che non si reimposta sui nuovi props dopo un refresh.
  onSalvato: (giacenzaRisultante: number) => void;
}) {
  const router = useRouter();
  const [quantita, setQuantita] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function salva() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/magazzino/bordi/${bordo.id}/${tipo}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantita: Number(quantita), note: note || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      onSalvato(data.giacenzaRisultante);
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore salvataggio");
      setSaving(false);
    }
  }

  const titolo = tipo === "carico" ? "Carico" : "Scarico";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 space-y-4 shadow-xl">
        <div>
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>{titolo} — {bordo.decorNome ?? bordo.decorCodice ?? bordo.materiale ?? "Bordo"}</h2>
          <p className="text-xs mt-1" style={{ color: "var(--color-grey-mid)" }}>
            Giacenza attuale: {bordo.giacenzaAttuale} {bordo.unitaMisura ?? ""}
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--color-grey-mid)" }}>
            Quantità {bordo.unitaMisura ? `(${bordo.unitaMisura})` : ""}
          </label>
          <input
            type="number" min="0" step="any" autoFocus
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            value={quantita}
            onChange={(e) => setQuantita(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--color-grey-mid)" }}>
            Note (opzionale)
          </label>
          <input
            type="text"
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {error && <div className="text-sm" style={{ color: "#991B1B" }}>{error}</div>}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: "#d1d5db", color: "var(--color-grey-mid)" }}
          >
            Annulla
          </button>
          <button
            onClick={salva}
            disabled={saving || !quantita || Number(quantita) <= 0}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--color-primary)" }}
          >
            {saving ? "Salvo…" : "Conferma"}
          </button>
        </div>
      </div>
    </div>
  );
}
