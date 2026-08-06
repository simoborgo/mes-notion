"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UBICAZIONI_FERRAMENTA } from "@/lib/types";

const AMBITI: { value: string; label: string }[] = [
  { value: "tutto", label: "Tutto il catalogo" },
  { value: "kanban", label: "Solo Kanban" },
  { value: "ubicazione", label: "Per ubicazione" },
  { value: "sotto_scorta", label: "Solo sotto scorta" },
  { value: "inventariato", label: "Solo voci Inventariati" },
];

export default function NuovoInventarioForm() {
  const router = useRouter();
  const [ambito, setAmbito] = useState("tutto");
  const [ubicazione, setUbicazione] = useState(UBICAZIONI_FERRAMENTA[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function apri() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/ferramenta/inventario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ambito, ambitoValore: ambito === "ubicazione" ? ubicazione : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      router.push(`/ferramenta/inventario/${data.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore apertura inventario");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

  return (
    <div className="rounded-xl border-2 p-4 space-y-4" style={{ borderColor: "#e5e4e0", background: "white" }}>
      <h3 className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>Nuovo inventario</h3>

      <div className="space-y-2">
        {AMBITI.map(a => (
          <label key={a.value} className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="radio" name="ambito" checked={ambito === a.value} onChange={() => setAmbito(a.value)} className="accent-orange-500" />
            {a.label}
          </label>
        ))}
      </div>

      {ambito === "ubicazione" && (
        <select className={inputCls} value={ubicazione} onChange={(e) => setUbicazione(e.target.value)}>
          {UBICAZIONI_FERRAMENTA.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      )}

      {error && (
        <div className="rounded-md border px-3 py-2" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
          <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{error}</p>
        </div>
      )}

      <button
        onClick={apri}
        disabled={saving}
        className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60"
        style={{ background: "var(--color-primary)" }}
      >
        {saving ? "Apertura…" : "Apri inventario"}
      </button>
    </div>
  );
}
