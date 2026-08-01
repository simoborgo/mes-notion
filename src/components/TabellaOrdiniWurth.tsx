"use client";

import { Fragment, useState } from "react";
import type { WurthOrdine, WurthOrdineRiga, StatoRicezioneOrdine } from "@/lib/wurthOrdiniRepository";
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

const STATO_RICEZIONE_BADGE: Record<StatoRicezioneOrdine, { bg: string; fg: string; label: string }> = {
  in_attesa: { bg: "#F3F4F6", fg: "#374151", label: "Ricezione: in attesa" },
  parziale: { bg: "#FEF3C7", fg: "#92400E", label: "Ricezione: parziale" },
  evaso: { bg: "#D1FAE5", fg: "#065F46", label: "Evaso" },
  evaso_manuale: { bg: "#D1FAE5", fg: "#065F46", label: "Evaso (manuale)" },
};

export default function TabellaOrdiniWurth({
  ordini: ordiniIniziali,
  articoli: articoliIniziali,
}: {
  ordini: WurthOrdine[];
  articoli: Record<string, ArticoloFerramenta>;
}) {
  const [aperto, setAperto] = useState<string | null>(null);
  const [ordini, setOrdini] = useState(ordiniIniziali);
  const [articoli, setArticoli] = useState(articoliIniziali);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [aggiornati, setAggiornati] = useState<Set<string>>(new Set());
  const [rigaRicevendo, setRigaRicevendo] = useState<string | null>(null);
  const [ricevendo, setRicevendo] = useState(false);
  const [segnandoEvaso, setSegnandoEvaso] = useState<string | null>(null);
  const [errore, setErrore] = useState("");

  function aggiornaRiga(ordineId: string, rigaAggiornata: WurthOrdineRiga, statoRicezione: StatoRicezioneOrdine) {
    setOrdini((prev) => prev.map((o) => o.id !== ordineId ? o : {
      ...o,
      statoRicezione,
      righe: o.righe.map((r) => r.id === rigaAggiornata.id ? rigaAggiornata : r),
    }));
  }

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

  async function ricevi(ordineId: string, rigaId: string, quantita: number, codiceAbarreScansionato: string) {
    setRicevendo(true);
    setErrore("");
    try {
      const res = await fetch(`/api/ferramenta/wurth-ordini/${ordineId}/righe/${rigaId}/ricevi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantita, codiceAbarreScansionato: codiceAbarreScansionato || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      aggiornaRiga(ordineId, data.riga, data.statoRicezione);
      setRigaRicevendo(null);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore durante il carico.");
    } finally {
      setRicevendo(false);
    }
  }

  async function segnaEvaso(ordineId: string) {
    if (!confirm("Segnare l'ordine come evaso? Usalo solo se il fornitore non consegnerà più il residuo — non tocca le giacenze.")) return;
    setSegnandoEvaso(ordineId);
    setErrore("");
    try {
      const res = await fetch(`/api/ferramenta/wurth-ordini/${ordineId}/segna-evaso`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setOrdini((prev) => prev.map((o) => o.id === ordineId ? { ...o, statoRicezione: data.statoRicezione } : o));
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore durante l'aggiornamento.");
    } finally {
      setSegnandoEvaso(null);
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
        const badgeRicezione = STATO_RICEZIONE_BADGE[o.statoRicezione] ?? STATO_RICEZIONE_BADGE.in_attesa;
        const isAperto = aperto === o.id;
        const evaso = o.statoRicezione === "evaso" || o.statoRicezione === "evaso_manuale";

        return (
          <div key={o.id} className="rounded-xl border overflow-hidden" style={{ borderColor: "#e5e4e0" }}>
            <div className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition-colors" style={{ background: "white" }}>
              <button type="button" onClick={() => setAperto(isAperto ? null : o.id)} className="flex-1 flex items-center gap-3 flex-wrap text-left">
                <span className="font-semibold text-sm" style={{ color: "var(--color-black)" }}>
                  Ordine {o.numeroOrdine}
                </span>
                <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
                  {fmtData(o.dataOrdine)} · consegna prevista {fmtData(o.dataConsegnaPrevista)}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: badge.bg, color: badge.fg }}>
                  {badge.label}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: badgeRicezione.bg, color: badgeRicezione.fg }}>
                  {badgeRicezione.label}
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
              </button>
              {!evaso && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); segnaEvaso(o.id); }}
                  disabled={segnandoEvaso === o.id}
                  className="text-xs px-2.5 py-1.5 rounded-lg font-semibold whitespace-nowrap border disabled:opacity-60"
                  style={{ color: "#374151", background: "white", borderColor: "#d1d5db" }}
                >
                  {segnandoEvaso === o.id ? "Salvo…" : "Segna come evaso"}
                </button>
              )}
              <button type="button" onClick={() => setAperto(isAperto ? null : o.id)} style={{ color: "var(--color-grey-mid)" }}>
                {isAperto ? "▲" : "▼"}
              </button>
            </div>

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
                      <th className="text-right px-3 py-2 font-semibold">Ricevuto</th>
                      <th className="text-left px-3 py-2 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.righe.map((r) => {
                      const articolo = r.articoloId ? articoli[r.articoloId] : undefined;
                      const nonCensito = !r.articoloId;
                      const daVerificare = !nonCensito && r.discrepanzaPrezzo;
                      const giaAggiornato = aggiornati.has(r.id);
                      const completa = !nonCensito && r.quantitaRicevuta >= r.quantita;
                      const residuo = Math.max(r.quantita - r.quantitaRicevuta, 0);
                      const formAperto = rigaRicevendo === r.id;
                      return (
                        <Fragment key={r.id}>
                        <tr className="border-t" style={{ borderColor: "#f0efec" }}>
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
                          <td className="px-3 py-2 text-right">
                            {nonCensito ? "—" : (
                              <span style={{ color: completa ? "#065F46" : "var(--color-black)", fontWeight: completa ? 600 : 400 }}>
                                {r.quantitaRicevuta} / {r.quantita}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col items-start gap-1">
                              {daVerificare && !giaAggiornato && r.articoloId && (
                                <button
                                  type="button"
                                  disabled={salvando === r.id}
                                  onClick={() => aggiornaPrezzoRiferimento(r.articoloId!, r.prezzoNettoPezzo, r.id)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white transition-opacity disabled:opacity-60 whitespace-nowrap"
                                  style={{ background: "var(--color-primary)" }}
                                >
                                  {salvando === r.id ? "Salvo…" : "Aggiorna prezzo di riferimento"}
                                </button>
                              )}
                              {nonCensito ? (
                                <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
                                  Non ricevibile — censire l&apos;articolo in Anagrafica prima di caricarlo
                                </span>
                              ) : !completa && (
                                <button
                                  type="button"
                                  onClick={() => setRigaRicevendo(formAperto ? null : r.id)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-semibold border whitespace-nowrap"
                                  style={{ color: "#166534", background: "#F0FDF4", borderColor: "#86EFAC" }}
                                >
                                  {formAperto ? "Annulla" : "Ricevi"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {formAperto && (
                          <tr className="border-t" style={{ borderColor: "#f0efec", background: "#FAFAF9" }}>
                            <td colSpan={8} className="px-3 py-3">
                              <form
                                className="flex flex-wrap items-end gap-3"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const fd = new FormData(e.currentTarget);
                                  const quantita = Number(fd.get("quantita"));
                                  const barcode = String(fd.get("barcode") || "");
                                  if (quantita > 0) ricevi(o.id, r.id, quantita, barcode);
                                }}
                              >
                                <div>
                                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-grey-mid)" }}>Quantità ricevuta</label>
                                  <input
                                    name="quantita"
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    defaultValue={residuo || r.quantita}
                                    className="border rounded px-2 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-orange-300"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-grey-mid)" }}>
                                    Codice a barre <span className="font-normal">(opzionale, scansiona col lettore)</span>
                                  </label>
                                  <input
                                    name="barcode"
                                    type="text"
                                    autoFocus
                                    className="border rounded px-2 py-1.5 text-sm w-56 font-mono focus:outline-none focus:ring-2 focus:ring-orange-300"
                                  />
                                </div>
                                <button
                                  type="submit"
                                  disabled={ricevendo}
                                  className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                                  style={{ background: "#166534" }}
                                >
                                  {ricevendo ? "Carico…" : "Conferma carico"}
                                </button>
                              </form>
                            </td>
                          </tr>
                        )}
                        </Fragment>
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
