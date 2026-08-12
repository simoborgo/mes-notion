"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Commessa } from "@/lib/types";
import CommessaAutocomplete from "./CommessaAutocomplete";

export default function FormNuovoKitCommessa({ commesseList }: { commesseList: Commessa[] }) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [commessaId, setCommessaId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [errore, setErrore] = useState("");

  const commessaMatch = commessaId ? commesseList.find(c => c.id === commessaId) : null;

  async function crea() {
    if (!commessaId) { setErrore("Seleziona una Commessa"); return; }
    setCreando(true);
    setErrore("");
    try {
      const commessaLabel = commessaMatch ? `${commessaMatch.numeroCommessa}${commessaMatch.cliente ? ` — ${commessaMatch.cliente}` : ""}` : null;
      const res = await fetch("/api/ferramenta/kit-commessa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commessaId, commessaLabel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      router.push(`/ferramenta/kit-commessa/${data.id}`);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore creazione Kit Commessa");
      setCreando(false);
    }
  }

  if (!aperto) {
    return (
      <button
        onClick={() => setAperto(true)}
        className="w-full py-3 rounded-xl text-sm font-bold text-white"
        style={{ background: "var(--color-primary)" }}
      >
        + Nuovo Kit Commessa
      </button>
    );
  }

  return (
    <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#e5e4e0", background: "white" }}>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>
          Commessa
        </label>
        <CommessaAutocomplete commesseList={commesseList} value={commessaId} onChange={setCommessaId} placeholder="Cerca Commessa…" />
      </div>
      {errore && (
        <div className="rounded-md border px-3 py-2" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
          <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{errore}</p>
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => setAperto(false)}
          className="px-4 py-2.5 text-sm font-medium rounded-lg border hover:bg-gray-50"
        >
          Annulla
        </button>
        <button
          onClick={crea}
          disabled={creando}
          className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-60"
          style={{ background: "var(--color-primary)" }}
        >
          {creando ? "Creazione…" : "Crea Kit Commessa"}
        </button>
      </div>
    </div>
  );
}
