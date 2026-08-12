"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OdpAttivo } from "@/lib/types";
import OdpAutocomplete from "./OdpAutocomplete";

// odpList caricata lato client SOLO quando si apre il form (non al caricamento della pagina):
// getOdpAttivi() dipende dalla cache Notion delle Schede, a freddo può richiedere 15-20s — non
// deve bloccare il rendering di tutta la pagina Scarico per chi usa solo lo scarico rapido.
export default function FormNuovoScarico() {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [odpList, setOdpList] = useState<OdpAttivo[] | null>(null);
  const [erroreOdp, setErroreOdp] = useState("");
  const [odp, setOdp] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    if (!aperto || odpList !== null) return;
    fetch("/api/ferramenta/odp-list")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setOdpList(data); else throw new Error(data?.error ?? "Risposta inattesa"); })
      .catch(e => setErroreOdp(e instanceof Error ? e.message : "Errore caricamento elenco ODP"));
  }, [aperto, odpList]);

  const odpMatch = odp && odpList ? odpList.find(o => o.odp === odp) : null;

  async function crea() {
    setCreando(true);
    setErrore("");
    try {
      const res = await fetch("/api/ferramenta/scarichi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ odpId: odpMatch?.id ?? null, odpLabel: odp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      router.push(`/ferramenta/scarichi/${data.id}`);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore creazione scarico");
      setCreando(false);
    }
  }

  if (!aperto) {
    return (
      <button
        onClick={() => setAperto(true)}
        className="w-full py-3 rounded-xl text-sm font-bold text-white"
        style={{ background: "#DC2626" }}
      >
        + Nuovo Scarico
      </button>
    );
  }

  return (
    <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#e5e4e0", background: "white" }}>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>
          ODP (facoltativo — lascia vuoto per uno scarico libero)
        </label>
        {odpList ? (
          <OdpAutocomplete odpList={odpList} value={odp} onChange={setOdp} placeholder="Collega a un ODP…" />
        ) : erroreOdp ? (
          <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{erroreOdp}</p>
        ) : (
          <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Caricamento elenco ODP…</p>
        )}
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
          style={{ background: "#DC2626" }}
        >
          {creando ? "Creazione…" : "Apri Scarico"}
        </button>
      </div>
    </div>
  );
}
