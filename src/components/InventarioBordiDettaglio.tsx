"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface RigaView {
  id: string;
  entitaId: string;
  codice: string | null;
  descrizione: string | null;
  giacenzaTeorica: number;
  giacenzaContata: number | null;
  scostamento: number | null;
}

export default function InventarioBordiDettaglio({
  inventarioId, stato, righe, puoChiudere,
}: {
  inventarioId: string;
  stato: "aperto" | "chiuso";
  righe: RigaView[];
  puoChiudere: boolean;
}) {
  const router = useRouter();
  const [soloDaContare, setSoloDaContare] = useState(stato === "aperto");
  const [chiudendo, setChiudendo] = useState(false);
  const [error, setError] = useState("");
  const [valori, setValori] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  const daContareCount = useMemo(() => righe.filter(r => r.giacenzaContata == null).length, [righe]);

  const filtrate = useMemo(
    () => righe.filter(r => !soloDaContare || r.giacenzaContata == null),
    [righe, soloDaContare]
  );

  async function registraConteggio(entitaId: string) {
    const giacenzaContata = Number(valori[entitaId]);
    if (!(giacenzaContata >= 0)) return;
    setSalvando(entitaId);
    setError("");
    try {
      const res = await fetch(`/api/magazzino/bordi/inventario/${inventarioId}/righe/${entitaId}/conta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ giacenzaContata }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore registrazione conteggio");
    } finally {
      setSalvando(null);
    }
  }

  async function chiudi() {
    const messaggio = daContareCount > 0
      ? `Ci sono ancora ${daContareCount} bordi non contati — resteranno alla giacenza teorica di apertura. Chiudere comunque l'inventario?`
      : "Chiudere l'inventario?";
    if (!confirm(messaggio)) return;

    setChiudendo(true);
    setError("");
    try {
      const res = await fetch(`/api/magazzino/bordi/inventario/${inventarioId}/chiudi`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore chiusura inventario");
    } finally {
      setChiudendo(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={() => setSoloDaContare(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded border text-sm font-medium transition-colors"
          style={soloDaContare
            ? { background: "#FEF3C7", color: "#92400E", borderColor: "#FCD34D" }
            : { background: "white", color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}
        >
          Da contare
          {daContareCount > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full text-xs font-bold w-5 h-5"
              style={soloDaContare ? { background: "#92400E", color: "white" } : { background: "#FEF3C7", color: "#92400E" }}
            >
              {daContareCount}
            </span>
          )}
        </button>

        {stato === "aperto" && puoChiudere && (
          <button
            onClick={chiudi}
            disabled={chiudendo}
            className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "#166534" }}
          >
            {chiudendo ? "Chiusura…" : "Chiudi inventario"}
          </button>
        )}
      </div>
      {error && <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <th className="px-4 py-3">Decor</th>
              <th className="px-4 py-3 min-w-[160px]">Descrizione</th>
              <th className="px-4 py-3">Teorica</th>
              <th className="px-4 py-3">Contata</th>
              <th className="px-4 py-3">Scostamento</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtrate.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessun bordo
                </td>
              </tr>
            ) : (
              filtrate.map(r => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{r.codice || "—"}</td>
                  <td className="px-4 py-3">{r.descrizione || "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{r.giacenzaTeorica}</td>
                  <td className="px-4 py-3 tabular-nums">{r.giacenzaContata ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.scostamento != null && r.scostamento !== 0 ? (
                      <span className="font-semibold" style={{ color: r.scostamento > 0 ? "#166534" : "#991B1B" }}>
                        {r.scostamento > 0 ? "+" : ""}{r.scostamento}
                      </span>
                    ) : r.giacenzaContata != null ? "0" : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {stato === "aperto" && r.giacenzaContata == null && (
                      <div className="flex gap-2 justify-end">
                        <input
                          type="number" min="0" step="any"
                          className="w-24 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                          placeholder="Qtà"
                          value={valori[r.entitaId] ?? ""}
                          onChange={(e) => setValori(v => ({ ...v, [r.entitaId]: e.target.value }))}
                        />
                        <button
                          onClick={() => registraConteggio(r.entitaId)}
                          disabled={salvando === r.entitaId || valori[r.entitaId] === undefined || valori[r.entitaId] === ""}
                          className="text-xs px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap border disabled:opacity-50"
                          style={{ color: "#92400E", background: "#FFFBEB", borderColor: "#FCD34D" }}
                        >
                          {salvando === r.entitaId ? "…" : "Registra"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
