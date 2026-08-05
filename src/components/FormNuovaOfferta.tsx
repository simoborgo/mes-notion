"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls = "rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

export default function FormNuovaOfferta() {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [cliente, setCliente] = useState("");
  const [valoreCommessa, setValoreCommessa] = useState("");
  const [dataOfferta, setDataOfferta] = useState(() => new Date().toISOString().slice(0, 10));
  const [dataConsegnaPrevista, setDataConsegnaPrevista] = useState("");
  const [probabilitaChiusura, setProbabilitaChiusura] = useState("40");
  const [creando, setCreando] = useState(false);
  const [errore, setErrore] = useState("");

  async function crea() {
    if (!cliente.trim()) { setErrore("Il cliente è obbligatorio"); return; }
    setCreando(true);
    setErrore("");
    try {
      const res = await fetch("/api/offerte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente: cliente.trim(),
          valoreCommessa: valoreCommessa || null,
          dataOfferta,
          dataConsegnaPrevista: dataConsegnaPrevista || null,
          probabilitaChiusura: Number(probabilitaChiusura),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      router.push(`/offerte/${data.id}`);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore creazione offerta");
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
        + Nuova offerta
      </button>
    );
  }

  return (
    <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#e5e4e0", background: "white" }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>Cliente</label>
          <input className={inputCls} style={{ height: 44, width: "100%" }} value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nome cliente" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>Valore commessa (€)</label>
          <input type="number" min="0" step="any" className={inputCls} style={{ height: 44, width: "100%" }} value={valoreCommessa} onChange={e => setValoreCommessa(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>Data offerta</label>
          <input type="date" className={inputCls} style={{ height: 44, width: "100%" }} value={dataOfferta} onChange={e => setDataOfferta(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>Data consegna prevista (stima)</label>
          <input type="date" className={inputCls} style={{ height: 44, width: "100%" }} value={dataConsegnaPrevista} onChange={e => setDataConsegnaPrevista(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>Probabilità di chiusura (%)</label>
          <input type="number" min="0" max="100" className={inputCls} style={{ height: 44, width: "100%" }} value={probabilitaChiusura} onChange={e => setProbabilitaChiusura(e.target.value)} />
        </div>
      </div>
      {errore && (
        <div className="rounded-md border px-3 py-2" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
          <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{errore}</p>
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <button onClick={() => setAperto(false)} className="px-4 py-2.5 text-sm font-medium rounded-lg border hover:bg-gray-50">Annulla</button>
        <button
          onClick={crea}
          disabled={creando}
          className="px-4 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
          style={{ background: "var(--color-primary)" }}
        >
          {creando ? "Creazione…" : "Crea offerta"}
        </button>
      </div>
    </div>
  );
}
