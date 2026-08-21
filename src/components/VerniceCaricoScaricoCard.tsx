"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Vernice } from "@/lib/types";

// Versione "pagina intera" (non modale) della stessa logica di
// MagazzinoVerniceCaricoScaricoModal.tsx — usata dopo lo scan del QR sull'etichetta stampata,
// dove non c'è una tabella sotto da cui aprire un overlay.
export default function VerniceCaricoScaricoCard({ vernice }: { vernice: Vernice }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"carico" | "scarico">("scarico");
  const [quantita, setQuantita] = useState("");
  const [note, setNote] = useState("");
  const [stato, setStato] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [giacenzaRisultante, setGiacenzaRisultante] = useState<number | null>(null);

  async function salva() {
    const q = Number(quantita);
    if (!q || q <= 0) { setError("Inserisci una quantità valida"); return; }
    setStato("loading");
    setError("");
    try {
      const res = await fetch(`/api/verniciatura/vernici/${vernice.id}/${tipo}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantita: q, note: note || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setGiacenzaRisultante(data.giacenzaRisultante ?? null);
      setStato("done");
      router.refresh();
    } catch (e) {
      setStato("error");
      setError(e instanceof Error ? e.message : "Errore salvataggio");
    }
  }

  const titolo = vernice.descrizioneColore || vernice.coloreCodice || vernice.tipologia;

  if (stato === "done") {
    return (
      <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}>
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 36, height: 36, background: "#D1FAE5" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <div>
            <p className="font-semibold text-sm" style={{ color: "#14532D" }}>{tipo === "carico" ? "Carico" : "Scarico"} registrato</p>
            <p className="text-xs mt-0.5" style={{ color: "#166534" }}>
              {titolo} — {quantita} {vernice.unitaMisura ?? ""}
              {giacenzaRisultante !== null && ` · giacenza ora ${giacenzaRisultante} ${vernice.unitaMisura ?? ""}`}
            </p>
          </div>
        </div>
        <button
          onClick={() => { setStato("idle"); setQuantita(""); setNote(""); setGiacenzaRisultante(null); }}
          className="w-full py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: "#166534" }}
        >
          Registra un altro movimento
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#e5e4e0", background: "white" }}>
      <div>
        <p className="font-bold text-lg" style={{ color: "var(--color-black)" }}>{titolo}</p>
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>{vernice.tipologia}{vernice.codiceInventario ? ` · ${vernice.codiceInventario}` : ""}</p>
        <p className="text-sm mt-1" style={{ color: "var(--color-black)" }}>
          Giacenza attuale: <strong>{vernice.giacenzaAttuale} {vernice.unitaMisura ?? ""}</strong>
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTipo("carico")}
          className="flex-1 py-2.5 rounded-lg text-sm font-bold border"
          style={{
            color: tipo === "carico" ? "white" : "#166534",
            background: tipo === "carico" ? "#166534" : "rgba(22,101,52,0.08)",
            borderColor: "rgba(22,101,52,0.3)",
          }}
        >
          Carico
        </button>
        <button
          type="button"
          onClick={() => setTipo("scarico")}
          className="flex-1 py-2.5 rounded-lg text-sm font-bold border"
          style={{
            color: tipo === "scarico" ? "white" : "var(--color-primary)",
            background: tipo === "scarico" ? "var(--color-primary)" : "rgba(240,143,37,0.08)",
            borderColor: "rgba(240,143,37,0.3)",
          }}
        >
          Scarico
        </button>
      </div>

      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>
          Quantità ({vernice.unitaMisura || "unità"})
        </label>
        <input
          type="number"
          min="0"
          step="any"
          value={quantita}
          onChange={(e) => setQuantita(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void salva(); } }}
          className="w-full rounded-lg border px-3 text-lg font-semibold"
          style={{ height: 52, borderColor: "#d1d5db" }}
        />
      </div>

      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>Note (opzionale)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "#d1d5db" }}
        />
      </div>

      {error && (
        <div className="rounded-md border px-3 py-2" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
          <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{error}</p>
        </div>
      )}

      <button
        onClick={salva}
        disabled={stato === "loading"}
        className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
        style={{ background: tipo === "carico" ? "#166534" : "var(--color-primary)" }}
      >
        {stato === "loading" && (
          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        )}
        {stato === "loading" ? "Registrazione in corso…" : `Conferma ${tipo}`}
      </button>
    </div>
  );
}
