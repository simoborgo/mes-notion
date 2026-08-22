"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Vernice } from "@/lib/types";

function corrisponde(v: Vernice, q: string): boolean {
  const testo = `${v.codiceInventario ?? ""} ${v.codiceTintometro ?? ""} ${v.descrizioneColore ?? ""} ${v.coloreCodice ?? ""} ${v.tipologia}`.toLowerCase();
  return testo.includes(q);
}

// Costruzione della lista per l'ambito "libero": stesso motore di ricerca di CercaVerniceForm
// (Codice Modar/Tintometro/descrizione), ma qui ogni risultato si AGGIUNGE all'inventario già
// aperto invece di portarci via — resta su questa pagina per aggiungerne altri di seguito.
export default function AggiungiVerniceLiberoForm({ inventarioId, vernici }: { inventarioId: string; vernici: Vernice[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [aggiungendoId, setAggiungendoId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const risultati = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return vernici.filter((v) => corrisponde(v, q)).slice(0, 15);
  }, [vernici, query]);

  async function aggiungi(v: Vernice) {
    setAggiungendoId(v.id);
    setError("");
    try {
      const res = await fetch(`/api/verniciatura/magazzino/inventario/${inventarioId}/righe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verniceId: v.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setQuery("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore aggiunta");
    } finally {
      setAggiungendoId(null);
    }
  }

  return (
    <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#FCD34D", background: "#FFFBEB" }}>
      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#92400E" }}>Aggiungi vernice alla lista</p>
      <input
        type="text"
        placeholder="Cod. Modar o Cod. Tintometro…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
        style={{ borderColor: "#d1d5db" }}
      />
      {error && <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{error}</p>}
      {query.trim() && (
        risultati.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Nessuna vernice trovata</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {risultati.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 bg-white" style={{ borderColor: "#E4E0DA" }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{v.descrizioneColore || v.coloreCodice || v.tipologia}</p>
                  <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
                    {v.codiceInventario ? `Modar ${v.codiceInventario}` : ""}{v.codiceTintometro ? ` · Tintometro ${v.codiceTintometro}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => aggiungi(v)}
                  disabled={aggiungendoId === v.id}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap border disabled:opacity-50"
                  style={{ color: "#92400E", background: "#FFFBEB", borderColor: "#FCD34D" }}
                >
                  {aggiungendoId === v.id ? "…" : "+ Aggiungi"}
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
