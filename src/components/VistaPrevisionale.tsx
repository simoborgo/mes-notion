"use client";

import { useState } from "react";

type Filtro = "confermate" | "tutte" | "pesato";

interface RigaAggregata {
  reparto: string;
  mese: string;
  capacitaOrdinaria: number;
  capacitaConStraordinari: number;
  oreRichieste: number;
  delta: number;
  oreEsterneNecessarie: number;
  costoStimato: number | null;
  basatoSuStima: boolean;
}

interface RigaManuale {
  offertaId: string;
  cliente: string;
  stato: string;
  codiceArticolo: string;
  orePreventivate: number;
}

interface OffertaEsclusa {
  offertaId: string;
  cliente: string;
  stato: string;
  motivo: string;
}

interface Risultato {
  righe: RigaAggregata[];
  richiedonoInputManuale: RigaManuale[];
  offerteEscluse: OffertaEsclusa[];
}

const FILTRI: { value: Filtro; label: string }[] = [
  { value: "tutte", label: "Tutte (worst case)" },
  { value: "pesato", label: "Pesato per probabilità" },
  { value: "confermate", label: "Solo Confermate" },
];

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function fmtMese(m: string): string {
  const [anno, mese] = m.split("-").map(Number);
  return new Date(anno, mese - 1, 1).toLocaleDateString("it-IT", { month: "short", year: "numeric" });
}

export default function VistaPrevisionale({
  risultatoIniziale, mesiOrizzonte, filtroIniziale,
}: {
  risultatoIniziale: Risultato;
  mesiOrizzonte: string[];
  filtroIniziale: Filtro;
}) {
  const [filtro, setFiltro] = useState<Filtro>(filtroIniziale);
  const [risultato, setRisultato] = useState<Risultato>(risultatoIniziale);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState("");

  async function cambiaFiltro(nuovo: Filtro) {
    setFiltro(nuovo);
    setLoading(true);
    setErrore("");
    try {
      const res = await fetch(`/api/previsionale?filtro=${nuovo}&mesi=${mesiOrizzonte.length}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setRisultato(data);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }

  const reparti = [...new Set(risultato.righe.map(r => r.reparto))];
  const perCella = new Map<string, RigaAggregata>();
  for (const r of risultato.righe) perCella.set(`${r.reparto}|${r.mese}`, r);

  const totaliMese = new Map<string, { capacitaConStraordinari: number; oreRichieste: number }>();
  for (const m of mesiOrizzonte) {
    let cap = 0, rich = 0;
    for (const rep of reparti) {
      const c = perCella.get(`${rep}|${m}`);
      if (c) { cap += c.capacitaConStraordinari; rich += c.oreRichieste; }
    }
    totaliMese.set(m, { capacitaConStraordinari: cap, oreRichieste: rich });
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {FILTRI.map(f => (
          <button
            key={f.value}
            onClick={() => cambiaFiltro(f.value)}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold rounded-full border disabled:opacity-60"
            style={filtro === f.value
              ? { background: "var(--color-primary)", borderColor: "var(--color-primary)", color: "white" }
              : { borderColor: "#d1d5db", color: "var(--color-grey-mid)" }}
          >
            {f.label}
          </button>
        ))}
        {loading && <span className="text-xs self-center" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</span>}
      </div>

      {errore && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}>{errore}</div>
      )}

      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-black)" }}>Vista generale</h2>
        <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
          <table className="text-sm" style={{ minWidth: mesiOrizzonte.length * 90 + 140 }}>
            <thead>
              <tr className="border-b text-xs font-semibold uppercase" style={{ borderColor: "#e5e4e0", color: "var(--color-grey-mid)" }}>
                <th className="text-left px-4 py-2 sticky left-0" style={{ background: "white" }}>Totale</th>
                {mesiOrizzonte.map(m => <th key={m} className="text-center px-2 py-2 whitespace-nowrap">{fmtMese(m)}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-2 font-semibold sticky left-0" style={{ background: "white" }}>Richieste / Capacità</td>
                {mesiOrizzonte.map(m => {
                  const t = totaliMese.get(m)!;
                  const ok = t.oreRichieste <= t.capacitaConStraordinari;
                  return (
                    <td key={m} className="text-center px-2 py-2 whitespace-nowrap" style={{ background: t.oreRichieste === 0 ? "white" : ok ? "#F0FDF4" : "#FEF2F2" }}>
                      <span className="font-semibold" style={{ color: ok ? "#166534" : "#991B1B" }}>{round(t.oreRichieste)}h</span>
                      <span style={{ color: "var(--color-grey-mid)" }}> / {round(t.capacitaConStraordinari)}h</span>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-black)" }}>Vista per reparto</h2>
        <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
          <table className="text-sm" style={{ minWidth: mesiOrizzonte.length * 100 + 140 }}>
            <thead>
              <tr className="border-b text-xs font-semibold uppercase" style={{ borderColor: "#e5e4e0", color: "var(--color-grey-mid)" }}>
                <th className="text-left px-4 py-2 sticky left-0" style={{ background: "white" }}>Reparto</th>
                {mesiOrizzonte.map(m => <th key={m} className="text-center px-2 py-2 whitespace-nowrap">{fmtMese(m)}</th>)}
              </tr>
            </thead>
            <tbody>
              {reparti.map(rep => (
                <tr key={rep} className="border-b last:border-0" style={{ borderColor: "#f0ece5" }}>
                  <td className="px-4 py-2 font-semibold sticky left-0" style={{ background: "white", color: "var(--color-black)" }}>{rep}</td>
                  {mesiOrizzonte.map(m => {
                    const c = perCella.get(`${rep}|${m}`);
                    if (!c || c.oreRichieste === 0) {
                      return <td key={m} className="text-center px-2 py-2 text-xs" style={{ color: "#d1d5db" }}>—</td>;
                    }
                    const ok = c.delta >= 0;
                    return (
                      <td key={m} className="text-center px-2 py-2 whitespace-nowrap" style={{ background: ok ? "#F0FDF4" : "#FEF2F2" }}>
                        <div>
                          <span className="font-semibold" style={{ color: ok ? "#166534" : "#991B1B" }}>{round(c.oreRichieste)}h</span>
                          {c.basatoSuStima && (
                            <span className="ml-1 text-xs font-bold" style={{ color: "#92400E" }} title="Basato su dati stimati, non ancora su consuntivi reali">~</span>
                          )}
                        </div>
                        <div className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
                          cap. {round(c.capacitaOrdinaria)}h{c.capacitaConStraordinari > c.capacitaOrdinaria ? ` (+${round(c.capacitaConStraordinari - c.capacitaOrdinaria)}h)` : ""}
                        </div>
                        {c.oreEsterneNecessarie > 0 && (
                          <div className="text-xs font-semibold" style={{ color: "#991B1B" }}>
                            est. {round(c.oreEsterneNecessarie)}h{c.costoStimato != null ? ` · €${round(c.costoStimato)}` : ""}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--color-grey-mid)" }}>~ = basato su dati stimati (non ancora su chiusure reali)</p>
      </div>

      {risultato.richiedonoInputManuale.length > 0 && (
        <div className="rounded-xl border p-4" style={{ borderColor: "#FCD34D", background: "#FFFBEB" }}>
          <h3 className="text-sm font-bold mb-2" style={{ color: "#92400E" }}>
            {risultato.richiedonoInputManuale.length} riga{risultato.richiedonoInputManuale.length === 1 ? "" : "he"} senza proposta di reparto
          </h3>
          <p className="text-xs mb-2" style={{ color: "#92400E" }}>Nessun dato storico per questi articoli — non conteggiate nella tabella sopra.</p>
          <ul className="text-xs space-y-1" style={{ color: "#92400E" }}>
            {risultato.richiedonoInputManuale.map((r, i) => (
              <li key={i}>{r.cliente} · {r.codiceArticolo} · {r.orePreventivate}h</li>
            ))}
          </ul>
        </div>
      )}

      {risultato.offerteEscluse.length > 0 && (
        <div className="rounded-xl border p-4" style={{ borderColor: "#d1d5db", background: "#F5F2EE" }}>
          <h3 className="text-sm font-bold mb-2" style={{ color: "var(--color-black)" }}>
            {risultato.offerteEscluse.length} offert{risultato.offerteEscluse.length === 1 ? "a esclusa" : "e escluse"} dal planner
          </h3>
          <ul className="text-xs space-y-1" style={{ color: "var(--color-grey-mid)" }}>
            {risultato.offerteEscluse.map((o, i) => (
              <li key={i}>{o.cliente} ({o.stato}) — {o.motivo}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
