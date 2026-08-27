"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Solo ambito "tutto" per Bordi in questa prima fase — nessun selettore, a differenza di Vernici
// (vedi NuovoInventarioVerniciForm.tsx), aggiungibile in futuro se richiesto.
export default function NuovoInventarioBordiForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function apri() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/magazzino/bordi/inventario", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      router.push(`/magazzino/bordi/inventario/${data.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore apertura inventario");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border-2 p-4 space-y-4" style={{ borderColor: "#e5e4e0", background: "white" }}>
      <h3 className="text-sm font-semibold" style={{ color: "var(--color-black)" }}>Nuovo inventario</h3>
      <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
        Conteggio dell&apos;intero catalogo Bordi attivi.
      </p>

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
