"use client";

import { useState } from "react";
import type { WurthOrdine } from "@/lib/wurthOrdiniRepository";
import type { ArticoloFerramenta } from "@/lib/types";

function fmtData(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

function fmtPrezzo(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + " €";
}

const STATO_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  ricevuto: { bg: "#FEF3C7", fg: "#92400E", label: "Ricevuto" },
  elaborato: { bg: "#D1FAE5", fg: "#065F46", label: "Elaborato" },
  errore: { bg: "#FEE2E2", fg: "#991B1B", label: "Errore" },
};

export default function TabellaOrdiniWurth({
  ordini,
  articoli: articoliIniziali,
}: {
  ordini: WurthOrdine[];
  articoli: Record<string, ArticoloFerramenta>;
}) {
  const [aperto, setAperto] = useState<string | null>(null);
  const [articoli, setArticoli] = useState(articoliIniziali);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [aggiornati, setAggiornati] = useState<Set<string>>(new Set());
  const [errore, setErrore] = useState("");

  async function aggiornaPrezzoRiferimento(articoloId: string, prezzo: number, rigaId: string) {
    setSalvando(rigaId);
    setErrore("");
    try {
      const res = await fetch(`/api/ferramenta/articoli/${articoloId}/classificazione`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prezzoRiferimento: prezzo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setArticoli((prev) => ({ ...prev, [articoloId]: data }));
      setAggiornati((prev) => new Set(prev).add(rigaId));
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore durante il salvataggio.");
    } finally {
      setSalvando(null);
    }
  }

  if (ordini.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
        Nessun ordine Wurth ricevuto finora.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {errore && (
        <div className="rounded-md border px-3 py-2" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
          <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{errore}</p>
        </div>
      )}

      {ordini.map((o) => {
        const nRighe = o.righe.length;
        const nDiscrepanza = o.righe.filter((r) => r.articoloId && r.discrepanzaPrezzo).length;
        const nNonCensiti = o.righe.filter((r) => !r.articoloId).length;
        const badge = STATO_BADGE[o.statoElaborazione] ?? STATO_BADGE.ricevuto;
        const isAperto = aperto === o.id;

        return (
          <div key={o.id} className="rounded-xl border overflow-hidden" style={{ borderColor: "#e5e4e0" }}>
            <button
              type="button"
              onClick={() => setAperto(isAperto ? null : o.id)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              style={{ background: "white" }}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-semibold text-sm" style={{ color: "var(--color-black)" }}>
                  Ordine {o.numeroOrdine}
                </span>
                <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
                  {fmtData(o.dataOrdine)} · consegna prevista {fmtData(o.dataConsegnaPrevista)}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: badge.bg, color: badge.fg }}>
                  {badge.label}
                </span>
                {nDiscrepanza > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#FEE2E2", color: "#991B1B" }}>
                    {nDiscrepanza} da verificare
                  </span>
                )}
                {nNonCensiti > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#F3F4F6", color: "#374151" }}>
                    {nNonCensiti} non censiti
                  </span>
                )}
                <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{nRighe} righe</span>
              </div>
              <span style={{ color: "var(--color-grey-mid)" }}>{isAperto ? "▲" : "▼"}</span>
            </button>

            {isAperto && (
              <div className="overflow-x-auto border-t" style={{ borderColor: "#e5e4e0" }}>
                <table className="w-full text-xs" style={{ minWidth: 640 }}>
                  <thead>
                    <tr style={{ background: "#faf9f7" }}>
                      <th className="text-left px-3 py-2 font-semibold">Codice</th>
                      <th className="text-left px-3 py-2 font-semibold">Descrizione</th>
                      <th className="text-right px-3 py-2 font-semibold">Qtà</th>
                      <th className="text-right px-3 py-2 font-semibold">Prezzo tracciato</th>
                      <th className="text-right px-3 py-2 font-semibold">Prezzo riferimento</th>
                      <th className="text-left px-3 py-2 font-semibold">Stato</th>
                      <th className="text-left px-3 py-2 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.righe.map((r) => {
                      const articolo = r.articoloId ? articoli[r.articoloId] : undefined;
                      const nonCensito = !r.articoloId;
                      const daVerificare = !nonCensito && r.discrepanzaPrezzo;
                      const giaAggiornato = aggiornati.has(r.id);
                      return (
                        <tr key={r.id} className="border-t" style={{ borderColor: "#f0efec" }}>
                          <td className="px-3 py-2 font-mono">{r.codiceArticolo}</td>
                          <td className="px-3 py-2">{r.descrizione}</td>
                          <td className="px-3 py-2 text-right">{r.quantita}</td>
                          <td className="px-3 py-2 text-right">{fmtPrezzo(r.prezzoNettoPezzo)}</td>
                          <td className="px-3 py-2 text-right">{fmtPrezzo(articolo?.prezzoRiferimento ?? null)}</td>
                          <td className="px-3 py-2">
                            {nonCensito ? (
                              <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: "#F3F4F6", color: "#374151" }}>
                                Non censito
                              </span>
                            ) : daVerificare && !giaAggiornato ? (
                              <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: "#FEE2E2", color: "#991B1B" }}>
                                Da verificare
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: "#D1FAE5", color: "#065F46" }}>
                                {giaAggiornato ? "Aggiornato" : "OK"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {daVerificare && !giaAggiornato && r.articoloId && (
                              <button
                                type="button"
                                disabled={salvando === r.id}
                                onClick={() => aggiornaPrezzoRiferimento(r.articoloId!, r.prezzoNettoPezzo, r.id)}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white transition-opacity disabled:opacity-60"
                                style={{ background: "var(--color-primary)" }}
                              >
                                {salvando === r.id ? "Salvo…" : "Aggiorna prezzo di riferimento"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
