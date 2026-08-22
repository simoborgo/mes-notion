"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Vernice } from "@/lib/types";

function corrisponde(v: Vernice, q: string): boolean {
  const testo = `${v.codiceInventario ?? ""} ${v.codiceTintometro ?? ""} ${v.descrizioneColore ?? ""} ${v.coloreCodice ?? ""} ${v.tipologia}`.toLowerCase();
  return testo.includes(q);
}

export default function CercaVerniceForm({ vernici }: { vernici: Vernice[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const risultati = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return vernici.filter((v) => corrisponde(v, q)).slice(0, 20);
  }, [vernici, query]);

  // Un solo risultato esatto sul Codice Modar (l'identificatore fisicamente stampato sulla
  // vernice) — premere Invio ci porta lì direttamente, senza dover toccare la lista.
  const matchEsatto = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return vernici.find((v) => v.codiceInventario?.toLowerCase() === q) ?? null;
  }, [vernici, query]);

  function vaiAllaVernice(v: Vernice) {
    if (!v.codiceInventario) return;
    router.push(`/verniciatura/magazzino/vernici/${encodeURIComponent(v.codiceInventario)}`);
  }

  return (
    <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#e5e4e0", background: "white" }}>
      <input
        type="text"
        autoFocus
        inputMode="search"
        placeholder="Cod. Modar o Cod. Tintometro…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && matchEsatto) { e.preventDefault(); vaiAllaVernice(matchEsatto); } }}
        className="w-full rounded-lg border px-3 text-lg font-semibold"
        style={{ height: 52, borderColor: "#d1d5db" }}
      />

      {query.trim() && (
        risultati.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: "var(--color-grey-mid)" }}>Nessuna vernice trovata</p>
        ) : (
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {risultati.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => vaiAllaVernice(v)}
                className="w-full text-left rounded-lg border px-3 py-2.5 hover:bg-orange-50 transition-colors"
                style={{ borderColor: "#e5e4e0" }}
              >
                <p className="font-semibold text-sm" style={{ color: "var(--color-black)" }}>
                  {v.descrizioneColore || v.coloreCodice || v.tipologia}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
                  {v.tipologia}
                  {v.codiceInventario ? ` · Modar ${v.codiceInventario}` : ""}
                  {v.codiceTintometro ? ` · Tintometro ${v.codiceTintometro}` : ""}
                </p>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
