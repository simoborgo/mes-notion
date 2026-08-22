"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Vernice } from "@/lib/types";

// Ramo per l'ambito "libero": la vernice non è ancora nella lista dell'inventario aperto — a
// differenza degli altri ambiti (dove tutte le righe sono decise all'apertura), qui si aggiunge
// una vernice alla volta scansionando/cercando, con conferma esplicita prima di includerla.
export default function AggiungiInventarioLiberoCard({ vernice, sessioneId }: { vernice: Vernice; sessioneId: string }) {
  const router = useRouter();
  const [stato, setStato] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  const titolo = vernice.descrizioneColore || vernice.coloreCodice || vernice.tipologia;

  async function aggiungi() {
    setStato("loading");
    setError("");
    try {
      const res = await fetch(`/api/verniciatura/magazzino/inventario/${sessioneId}/righe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verniceId: vernice.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      router.refresh();
    } catch (e) {
      setStato("error");
      setError(e instanceof Error ? e.message : "Errore aggiunta all'inventario");
    }
  }

  return (
    <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#FCD34D", background: "#FFFBEB" }}>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#92400E" }}>Inventario libero in corso</p>
        <p className="font-bold text-lg mt-1" style={{ color: "var(--color-black)" }}>{titolo}</p>
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>{vernice.tipologia}{vernice.codiceInventario ? ` · ${vernice.codiceInventario}` : ""}</p>
        <p className="text-sm mt-1" style={{ color: "var(--color-black)" }}>
          Giacenza attuale: <strong>{vernice.giacenzaAttuale} {vernice.unitaMisura ?? ""}</strong>
        </p>
      </div>

      <p className="text-sm" style={{ color: "var(--color-black)" }}>
        Questa vernice non è ancora nella lista di questo inventario. Aggiungerla al conteggio?
      </p>

      {error && (
        <div className="rounded-md border px-3 py-2" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
          <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{error}</p>
        </div>
      )}

      <button
        onClick={aggiungi}
        disabled={stato === "loading"}
        className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-60"
        style={{ background: "#92400E" }}
      >
        {stato === "loading" ? "Aggiunta in corso…" : "Sì, aggiungi e conta"}
      </button>
      <Link href="/verniciatura/magazzino/cerca" className="block text-center text-xs underline" style={{ color: "#92400E" }}>
        ← Cerca un&apos;altra vernice
      </Link>
    </div>
  );
}
