"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ArticoloFerramenta } from "@/lib/types";
import ArticoloAutocomplete from "./ArticoloAutocomplete";

// Stessa logica di CaricoFerramentaForm ma inversa: un solo articolo, quantità libera, azione
// immediata — senza passare dalla sessione di raccolta QR (quella resta per chi preferisce
// scansionare più articoli di fila, questa per chi conosce già codice/quantità da digitare).
export default function ScaricoRapidoForm({ articoli }: { articoli: ArticoloFerramenta[] }) {
  const router = useRouter();
  const [articoloId, setArticoloId] = useState<string | null>(null);
  const [quantita, setQuantita] = useState("");
  const [stato, setStato] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  const selected = articoloId ? articoli.find(a => a.id === articoloId) : null;

  useEffect(() => {
    if (selected?.metodoGestione === "Kanban" && selected.quantitaStandardVaschetta) {
      setQuantita(String(selected.quantitaStandardVaschetta));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articoloId]);

  async function eseguiScarico(body: Record<string, number>) {
    setStato("loading");
    setError("");
    setWarnings([]);
    try {
      const res = await fetch(`/api/ferramenta/articoli/${articoloId}/scarico`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) throw new Error(data?.error ?? `Errore ${res.status}`);
      if (data.warnings?.length) setWarnings(data.warnings);
      setStato("done");
    } catch (e) {
      setStato("error");
      setError(e instanceof Error ? e.message : "Errore durante lo scarico.");
    }
  }

  function handleSubmit() {
    const q = Number(quantita);
    if (!articoloId || !selected) { setError("Seleziona un articolo"); return; }
    if (!q || q <= 0) { setError("Inserisci una quantità valida"); return; }
    if (!selected.metodoGestione) { setError("Articolo non ancora classificato (Kanban / A Pezzo) — non può essere scaricato da qui."); return; }
    setError("");

    if (selected.metodoGestione === "Kanban") {
      if (!selected.quantitaStandardVaschetta) { setError("Quantità Standard Vaschetta non configurata per questo articolo"); return; }
      const moltiplicatore = q / selected.quantitaStandardVaschetta;
      if (!Number.isInteger(moltiplicatore) || moltiplicatore < 1) {
        setError(`Per un articolo Kanban la quantità deve essere un multiplo intero della vaschetta standard (${selected.quantitaStandardVaschetta} ${selected.unitaMisura})`);
        return;
      }
      void eseguiScarico({ moltiplicatore });
    } else {
      void eseguiScarico({ quantita: q });
    }
  }

  function reset() {
    setArticoloId(null);
    setQuantita("");
    setStato("idle");
    setError("");
    setWarnings([]);
    router.refresh();
  }

  if (stato === "done" && selected) {
    return (
      <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#FCA5A5", background: "#FEF2F2" }}>
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 36, height: 36, background: "#FEE2E2" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#991B1B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <div>
            <p className="font-semibold text-sm" style={{ color: "#7F1D1D" }}>Scarico registrato</p>
            <p className="text-xs mt-0.5" style={{ color: "#991B1B" }}>{selected.descrizione} — -{quantita} {selected.unitaMisura}</p>
          </div>
        </div>
        {warnings.length > 0 && (
          <div className="rounded-lg px-3 py-2 space-y-1" style={{ background: "#FFFBEB", border: "1px solid #FCD34D" }}>
            {warnings.map((w, i) => <p key={i} className="text-xs" style={{ color: "#92400E" }}>{w}</p>)}
          </div>
        )}
        <button onClick={reset} className="text-sm px-4 py-2 rounded-lg font-medium" style={{ background: "#DC2626", color: "white" }}>
          Nuovo scarico
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
          Quantità scaricata {selected ? `(${selected.unitaMisura})` : ""}
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
        style={{ background: "#DC2626" }}
      >
        {stato === "loading" && (
          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        )}
        {stato === "loading" ? "Registrazione in corso…" : "Conferma scarico"}
      </button>
    </div>
  );
}
