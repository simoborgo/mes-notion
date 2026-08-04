"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OdpAttivo } from "@/lib/types";
import OdpAutocomplete from "./OdpAutocomplete";

export default function FormNuovaDistintaScarico({ odpList }: { odpList: OdpAttivo[] }) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [odp, setOdp] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [errore, setErrore] = useState("");

  const odpMatch = odp ? odpList.find(o => o.odp === odp) : null;

  async function crea() {
    setCreando(true);
    setErrore("");
    try {
      const res = await fetch("/api/ferramenta/distinte-scarico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ odpId: odpMatch?.id ?? null, odpLabel: odp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      router.push(`/ferramenta/distinte-scarico/${data.id}`);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore creazione distinta");
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
        + Nuova distinta di scarico
      </button>
    );
  }

  return (
    <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#e5e4e0", background: "white" }}>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>
          ODP (facoltativo — lascia vuoto per una distinta libera)
        </label>
        <OdpAutocomplete odpList={odpList} value={odp} onChange={setOdp} placeholder="Collega a un ODP…" />
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
          {creando ? "Creazione…" : "Apri distinta"}
        </button>
      </div>
    </div>
  );
}
