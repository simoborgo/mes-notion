"use client";

import { useState } from "react";

const inputCls = "rounded-lg border px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 w-32";

export default function CostoManodoperaForm({ costoIniziale }: { costoIniziale: number }) {
  const [valore, setValore] = useState(String(costoIniziale));
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState("");
  const [salvato, setSalvato] = useState(false);

  async function salva() {
    setSalvando(true);
    setErrore("");
    setSalvato(false);
    try {
      const res = await fetch("/api/admin/parametri-generali", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costoOrarioManodopera: Number(valore) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setValore(String(data.costoOrarioManodopera));
      setSalvato(true);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "#e5e4e0" }}>
      <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--color-black)" }}>Costo orario manodopera</h2>
      <p className="text-xs mb-3" style={{ color: "var(--color-grey-mid)" }}>
        Usato dal Previsionale per stimare le ore di un&apos;offerta senza righe articolo (ore = valore commessa / questo costo).
      </p>
      <div className="flex items-center gap-3">
        <input
          type="number" min="0" step="0.5" className={inputCls}
          value={valore} onChange={(e) => { setValore(e.target.value); setSalvato(false); }}
        />
        <span className="text-sm" style={{ color: "var(--color-grey-mid)" }}>€/h</span>
        <button
          onClick={salva} disabled={salvando}
          className="px-3 py-1.5 text-sm rounded-lg font-medium text-white disabled:opacity-60"
          style={{ background: "var(--color-primary)", borderRadius: "var(--radius-button)" }}
        >
          {salvando ? "Salvo…" : "Salva"}
        </button>
        {salvato && <span className="text-xs font-medium" style={{ color: "#166534" }}>Salvato</span>}
        {errore && <span className="text-xs font-medium" style={{ color: "#991B1B" }}>{errore}</span>}
      </div>
    </div>
  );
}
