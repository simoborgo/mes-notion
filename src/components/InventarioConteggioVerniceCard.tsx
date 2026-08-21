"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Vernice } from "@/lib/types";
import AvvisoIncoerenzaModal from "./AvvisoIncoerenzaModal";

interface RigaInfo {
  giacenzaTeorica: number;
}

// Stessa soglia/spirito di InventarioConteggioCard.tsx (Ferramenta) — non blocca, solo un
// avviso prima di confermare un conteggio molto diverso dalla giacenza teorica.
const SOGLIA_SCOSTAMENTO = 0.5;

export default function InventarioConteggioVerniceCard({
  vernice, riga, sessioneId,
}: {
  vernice: Vernice;
  riga: RigaInfo;
  sessioneId: string;
}) {
  const router = useRouter();
  const [quantita, setQuantita] = useState(String(riga.giacenzaTeorica));
  const [stato, setStato] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [delta, setDelta] = useState<number | null>(null);
  const [avviso, setAvviso] = useState<string[] | null>(null);

  const tornaAllInventario = () => router.push(`/verniciatura/magazzino/inventario/${sessioneId}`);

  useEffect(() => {
    if (stato !== "done") return;
    const t = setTimeout(tornaAllInventario, 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stato]);

  async function eseguiConta(q: number) {
    setAvviso(null);
    setStato("loading");
    setError("");
    try {
      const res = await fetch(`/api/verniciatura/magazzino/inventario/${sessioneId}/righe/${vernice.id}/conta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ giacenzaContata: q }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setDelta(data.delta);
      setStato("done");
    } catch (e) {
      setStato("error");
      setError(e instanceof Error ? e.message : "Errore durante il conteggio.");
    }
  }

  function handleConta() {
    const q = Number(quantita);
    if (q < 0 || Number.isNaN(q)) { setError("Inserisci una quantità valida"); return; }
    setError("");

    const scostamento = Math.abs(q - riga.giacenzaTeorica) / Math.max(riga.giacenzaTeorica, 1);
    if (scostamento > SOGLIA_SCOSTAMENTO) {
      setAvviso([`Il conteggio (${q}) si discosta molto dalla giacenza teorica (${riga.giacenzaTeorica}) — controlla di aver contato bene prima di confermare.`]);
      return;
    }
    void eseguiConta(q);
  }

  const titolo = vernice.descrizioneColore || vernice.coloreCodice || vernice.tipologia;

  if (stato === "done") {
    return (
      <div className="rounded-xl border-2 p-4 space-y-2" style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}>
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 36, height: 36, background: "#D1FAE5" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <div>
            <p className="font-semibold text-sm" style={{ color: "#14532D" }}>Conteggio registrato</p>
            <p className="text-xs mt-0.5" style={{ color: "#166534" }}>{titolo} — contate {quantita} {vernice.unitaMisura ?? ""}</p>
          </div>
        </div>
        {delta !== null && delta !== 0 && (
          <p className="text-xs font-medium" style={{ color: delta > 0 ? "#166534" : "#991B1B" }}>
            Scostamento: {delta > 0 ? "+" : ""}{delta} — movimento di rettifica generato
          </p>
        )}
        <button
          onClick={tornaAllInventario}
          className="w-full py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: "#166534" }}
        >
          Torna all&apos;inventario →
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: "#FCD34D", background: "#FFFBEB" }}>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#92400E" }}>Inventario in corso</p>
        <p className="font-bold text-lg mt-1" style={{ color: "var(--color-black)" }}>{titolo}</p>
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>{vernice.tipologia}{vernice.codiceInventario ? ` · ${vernice.codiceInventario}` : ""}</p>
      </div>
      <p className="text-sm" style={{ color: "var(--color-black)" }}>
        Giacenza teorica: <strong>{riga.giacenzaTeorica} {vernice.unitaMisura ?? ""}</strong>
      </p>

      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-grey-mid)" }}>
          Quantità contata ({vernice.unitaMisura || "unità"})
        </label>
        <input
          type="number"
          min="0"
          step="any"
          value={quantita}
          onChange={(e) => setQuantita(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleConta(); } }}
          className="w-full rounded-lg border px-3 text-lg font-semibold"
          style={{ height: 52, borderColor: "#d1d5db" }}
        />
      </div>

      {error && (
        <div className="rounded-md border px-3 py-2" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
          <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{error}</p>
        </div>
      )}

      <button
        onClick={handleConta}
        disabled={stato === "loading"}
        className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
        style={{ background: "#92400E" }}
      >
        {stato === "loading" && (
          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        )}
        {stato === "loading" ? "Registrazione in corso…" : "Conferma conteggio"}
      </button>

      {avviso && (
        <AvvisoIncoerenzaModal
          titolo="Valori non coerenti"
          messaggi={avviso}
          loading={stato === "loading"}
          onAnnulla={() => setAvviso(null)}
          onConferma={() => void eseguiConta(Number(quantita))}
        />
      )}
    </div>
  );
}
