"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ArticoloFerramenta } from "@/lib/types";
import ArticoloAutocomplete from "./ArticoloAutocomplete";

// Permette al magazziniere di aggiungere alla distinta di un kit un articolo non previsto
// originariamente, direttamente dal Foglio di Scarico — stesso endpoint e stesso vincolo
// (solo articoli "A Pezzo") già usati in GestioneKitOdp.tsx, qui riproposti nel contesto
// dello scarico invece che nella pagina admin di gestione kit.
export default function AggiungiArticoloKit({ odpId, articoliAPezzo }: { odpId: string; articoliAPezzo: ArticoloFerramenta[] }) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [articoloId, setArticoloId] = useState<string | null>(null);
  const [quantita, setQuantita] = useState("");
  const [errore, setErrore] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function aggiungi() {
    const q = Number(quantita);
    if (!articoloId) { setErrore("Seleziona un articolo"); return; }
    if (!(q > 0)) { setErrore("Quantità non valida"); return; }
    setSalvando(true);
    setErrore("");
    try {
      const res = await fetch(`/api/ferramenta/kit/${odpId}/righe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articoloId, quantita: q }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setArticoloId(null);
      setQuantita("");
      setAperto(false);
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore aggiunta riga");
    } finally {
      setSalvando(false);
    }
  }

  if (!aperto) {
    return (
      <button
        onClick={() => setAperto(true)}
        className="text-sm font-semibold px-3 py-2 rounded-lg border hover:bg-orange-50"
        style={{ color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.3)", background: "rgba(240,143,37,0.06)" }}
      >
        + Aggiungi articolo non previsto nel kit
      </button>
    );
  }

  return (
    <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: "#e5e4e0", background: "white" }}>
      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <ArticoloAutocomplete articoli={articoliAPezzo} value={articoloId} onChange={setArticoloId} placeholder="Cerca articolo A Pezzo…" />
        </div>
        <input
          type="number" min="0" step="any"
          className="rounded-lg border px-3 text-sm"
          style={{ width: 90, height: 44, borderColor: "#d1d5db" }}
          placeholder="Q.tà"
          value={quantita}
          onChange={(e) => setQuantita(e.target.value)}
        />
        <button
          onClick={aggiungi}
          disabled={salvando}
          className="px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
          style={{ height: 44, background: "var(--color-primary)" }}
        >
          {salvando ? "…" : "+ Aggiungi"}
        </button>
        <button
          onClick={() => { setAperto(false); setErrore(""); }}
          className="px-3 rounded-lg text-sm font-medium border"
          style={{ height: 44, borderColor: "#d1d5db", color: "var(--color-grey-mid)" }}
        >
          Annulla
        </button>
      </div>
      {errore && <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{errore}</p>}
    </div>
  );
}
