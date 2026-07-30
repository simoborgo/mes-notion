"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ArticoloFerramenta } from "@/lib/types";
import ArticoloAutocomplete from "./ArticoloAutocomplete";
import AvvisoIncoerenzaModal from "./AvvisoIncoerenzaModal";

export default function CaricoFerramentaForm({ articoli }: { articoli: ArticoloFerramenta[] }) {
  const router = useRouter();
  const [articoloId, setArticoloId] = useState<string | null>(null);
  const [quantita, setQuantita] = useState("");
  const [stato, setStato] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [avviso, setAvviso] = useState<string[] | null>(null);

  const selected = articoloId ? articoli.find(a => a.id === articoloId) : null;

  // Selezionando un Kanban precompiliamo con la Quantità Standard Vaschetta — il caso
  // comune è "arriva una vaschetta piena" — ma resta modificabile per consegne parziali.
  useEffect(() => {
    if (selected?.metodoGestione === "Kanban" && selected.quantitaStandardVaschetta) {
      setQuantita(String(selected.quantitaStandardVaschetta));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articoloId]);

  const quantitaNum = Number(quantita);
  const nonMultiploVaschetta =
    selected?.metodoGestione === "Kanban" &&
    !!selected.quantitaStandardVaschetta &&
    quantitaNum > 0 &&
    quantitaNum % selected.quantitaStandardVaschetta !== 0;

  async function eseguiCarico(q: number) {
    setAvviso(null);
    setStato("loading");
    setError("");
    try {
      const res = await fetch(`/api/ferramenta/articoli/${articoloId}/carico`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantita: q }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setStato("done");
    } catch (e) {
      setStato("error");
      setError(e instanceof Error ? e.message : "Errore durante il carico.");
    }
  }

  function handleSubmit() {
    const q = Number(quantita);
    if (!articoloId) { setError("Seleziona un articolo"); return; }
    if (!q || q <= 0) { setError("Inserisci una quantità valida"); return; }
    setError("");
    if (nonMultiploVaschetta) {
      setAvviso([`${q} non è multiplo della Quantità Standard Vaschetta (${selected!.quantitaStandardVaschetta} ${selected!.unitaMisura}) — controlla che sia corretto per una consegna parziale.`]);
      return;
    }
    void eseguiCarico(q);
  }

  function reset() {
    setArticoloId(null);
    setQuantita("");
    setStato("idle");
    setError("");
    router.refresh();
  }

  if (stato === "done" && selected) {
    return (
      <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}>
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 36, height: 36, background: "#D1FAE5" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <div>
            <p className="font-semibold text-sm" style={{ color: "#14532D" }}>Carico registrato</p>
            <p className="text-xs mt-0.5" style={{ color: "#166534" }}>{selected.descrizione} — +{quantita} {selected.unitaMisura}</p>
          </div>
        </div>
        <button onClick={reset} className="text-sm px-4 py-2 rounded-lg font-medium" style={{ background: "#166534", color: "white" }}>
          Nuovo carico
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 p-4 space-y-4" style={{ borderColor: "#e5e4e0", background: "white" }}>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>Articolo</label>
        <ArticoloAutocomplete articoli={articoli} value={articoloId} onChange={setArticoloId} />
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>
          Quantità caricata {selected ? `(${selected.unitaMisura})` : ""}
        </label>
        <input
          type="number"
          min="0"
          step="any"
          value={quantita}
          onChange={(e) => setQuantita(e.target.value)}
          className="w-full rounded-lg border px-3 text-lg font-semibold"
          style={{ height: 52, borderColor: "#d1d5db" }}
          placeholder="0"
        />
      </div>

      {error && (
        <div className="rounded-md border px-3 py-2" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
          <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{error}</p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={stato === "loading"}
        className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
        style={{ background: "var(--color-primary)" }}
      >
        {stato === "loading" && (
          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        )}
        {stato === "loading" ? "Registrazione in corso…" : "Conferma carico"}
      </button>

      {avviso && (
        <AvvisoIncoerenzaModal
          titolo="Valori non coerenti"
          messaggi={avviso}
          loading={stato === "loading"}
          onAnnulla={() => setAvviso(null)}
          onConferma={() => void eseguiCarico(Number(quantita))}
        />
      )}
    </div>
  );
}
