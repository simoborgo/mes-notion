"use client";

import { useState } from "react";
import type { ArticoloFerramenta, DistintaKitRiga, Scheda } from "@/lib/types";
import ArticoloAutocomplete from "./ArticoloAutocomplete";

export default function GestioneKitOdp({
  scheda, righeIniziali, articoliAPezzo,
}: {
  scheda: Scheda;
  righeIniziali: DistintaKitRiga[];
  articoliAPezzo: ArticoloFerramenta[];
}) {
  const [righe, setRighe] = useState(righeIniziali);
  const [articoloId, setArticoloId] = useState<string | null>(null);
  const [quantita, setQuantita] = useState("");
  const [errore, setErrore] = useState("");
  const [aggiungendo, setAggiungendo] = useState(false);
  const [confermaStato, setConfermaStato] = useState<"idle" | "loading" | "done" | "error">(scheda.kitFerramenta === "Si" ? "done" : "idle");
  const [confermaErrore, setConfermaErrore] = useState("");

  async function aggiungiRiga() {
    const q = Number(quantita);
    if (!articoloId) { setErrore("Seleziona un articolo"); return; }
    if (!(q > 0)) { setErrore("Quantità non valida"); return; }
    setAggiungendo(true);
    setErrore("");
    try {
      const res = await fetch(`/api/ferramenta/kit/${scheda.id}/righe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articoloId, quantita: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setRighe(prev => [...prev, data]);
      setArticoloId(null);
      setQuantita("");
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore aggiunta riga");
    } finally {
      setAggiungendo(false);
    }
  }

  async function rimuoviRiga(rigaId: string) {
    setRighe(prev => prev.filter(r => r.id !== rigaId));
    try {
      await fetch(`/api/ferramenta/kit/${scheda.id}/righe/${rigaId}`, { method: "DELETE" });
    } catch {
      // riallineamento silenzioso non critico: la riga verrà ripristinata al prossimo refresh se la DELETE fosse fallita
    }
  }

  async function conferma() {
    if (righe.length === 0) { setConfermaErrore("Aggiungi almeno una riga alla distinta"); return; }
    setConfermaStato("loading");
    setConfermaErrore("");
    try {
      const res = await fetch(`/api/ferramenta/kit/${scheda.id}/conferma`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) throw new Error(data?.error ?? `Errore ${res.status}`);
      setConfermaStato("done");
    } catch (e) {
      setConfermaStato("error");
      setConfermaErrore(e instanceof Error ? e.message : "Errore conferma");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="font-bold text-lg" style={{ color: "var(--color-black)" }}>{scheda.numeroScheda || scheda.odp}</p>
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>{scheda.odp} {scheda.clienteInfo ? `— ${scheda.clienteInfo}` : ""}</p>
      </div>

      <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "#e5e4e0", background: "white" }}>
        <h3 className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>Distinta articoli</h3>

        {righe.length > 0 && (
          <div className="space-y-2">
            {righe.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "#F5F2EE" }}>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm">{r.articoloDescrizione}</span>
                  <span className="text-xs ml-2" style={{ color: "var(--color-grey-mid)" }}>{r.articoloCodiceOs1}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums">{r.quantita}</span>
                <button onClick={() => rimuoviRiga(r.id)} className="text-gray-400 hover:text-gray-600 text-base leading-none px-1">×</button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <ArticoloAutocomplete articoli={articoliAPezzo} value={articoloId} onChange={setArticoloId} placeholder="Cerca articolo A Pezzo…" />
          </div>
          <input
            type="number" min="0" step="any"
            className="rounded-lg border px-3 text-sm"
            style={{ width: 90, height: 48, borderColor: "#d1d5db" }}
            placeholder="Q.tà"
            value={quantita}
            onChange={(e) => setQuantita(e.target.value)}
          />
          <button
            onClick={aggiungiRiga}
            disabled={aggiungendo}
            className="px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ height: 48, background: "var(--color-primary)" }}
          >
            {aggiungendo ? "…" : "+ Aggiungi"}
          </button>
        </div>
        {errore && <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{errore}</p>}

        <a
          href={`/api/ferramenta/kit/${scheda.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-xs underline"
          style={{ color: "var(--color-primary)" }}
        >
          Stampa PDF distinta
        </a>
      </div>

      {confermaStato === "done" ? (
        <div className="rounded-xl border-2 p-4 flex items-center gap-3" style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}>
          <span className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 36, height: 36, background: "#D1FAE5" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <div>
            <p className="font-semibold text-sm" style={{ color: "#14532D" }}>Kit confermato</p>
            <p className="text-xs mt-0.5" style={{ color: "#166534" }}>Il magazziniere è stato notificato</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#e5e4e0", background: "white" }}>
          {confermaErrore && (
            <div className="rounded-md border px-3 py-2" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
              <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{confermaErrore}</p>
            </div>
          )}
          <button
            onClick={conferma}
            disabled={confermaStato === "loading"}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: "#166534" }}
          >
            {confermaStato === "loading" && (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {confermaStato === "loading" ? "Conferma in corso…" : "✓ Conferma Kit e notifica magazziniere"}
          </button>
        </div>
      )}
    </div>
  );
}
