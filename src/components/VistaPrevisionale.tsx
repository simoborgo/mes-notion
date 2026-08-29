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
  capacitaResidua: number;
  oreSforate: number;
  oreStraordinarioNecessarie: number;
  oreEsterneNecessarie: number;
  numeroEsterniNecessari: number | null;
  giorniUomoEsterniNecessari: number | null;
  costoStimato: number | null;
  basatoSuStima: boolean;
  parametriStoriciApprossimati: boolean;
}

interface RigaTotaleAzienda {
  mese: string;
  capacitaOrdinaria: number;
  capacitaConStraordinari: number;
  oreRichieste: number;
  capacitaResidua: number;
  oreSforate: number;
  oreStraordinarioNecessarie: number;
  oreEsterneNecessarie: number;
  numeroEsterniNecessari: number | null;
  giorniUomoEsterniNecessari: number | null;
  costoStimato: number | null;
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
  totaliAzienda: RigaTotaleAzienda[];
  richiedonoInputManuale: RigaManuale[];
  offerteEscluse: OffertaEsclusa[];
}

const FILTRI: { value: Filtro; label: string }[] = [
  { value: "tutte", label: "Tutte (worst case)" },
  { value: "pesato", label: "Pesato per probabilità" },
  { value: "confermate", label: "Solo Confermate" },
];

// Quanti mesi passati includere oltre al mese corrente e ai futuri (deciso con l'utente
// 2026-08-27, configurabile invece di un valore fisso): i mesi passati usano i parametri
// reparto EFFETTIVAMENTE in vigore in quel mese (vedi risolviParametriAlMese nel repository),
// non quelli correnti — altrimenti un aumento di organico oggi farebbe sembrare "coperto" anche
// un mese passato che a suo tempo era in reale sofferenza.
const OPZIONI_MESI_INDIETRO = [0, 3, 6, 12];
const OPZIONI_MESI_AVANTI = [3, 6, 12];

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function fmtMese(m: string): string {
  const [anno, mese] = m.split("-").map(Number);
  return new Date(anno, mese - 1, 1).toLocaleDateString("it-IT", { month: "short", year: "numeric" });
}

function meseCorrenteStr(): string {
  const oggi = new Date();
  return `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}`;
}

export default function VistaPrevisionale({
  risultatoIniziale, mesiOrizzonte: mesiOrizzonteIniziale, filtroIniziale,
}: {
  risultatoIniziale: Risultato;
  mesiOrizzonte: string[];
  filtroIniziale: Filtro;
}) {
  const [filtro, setFiltro] = useState<Filtro>(filtroIniziale);
  const [mesiIndietro, setMesiIndietro] = useState(0);
  const [mesiAvanti, setMesiAvanti] = useState(mesiOrizzonteIniziale.length);
  const [mesiOrizzonte, setMesiOrizzonte] = useState<string[]>(mesiOrizzonteIniziale);
  const [risultato, setRisultato] = useState<Risultato>(risultatoIniziale);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState("");
  const meseCorrente = meseCorrenteStr();

  // risultatoIniziale cambia quando il Server Component padre rifà il fetch (es. router.refresh()
  // dopo un salvataggio in Parametri Reparto, altra tab dello stesso hub) — senza questo confronto
  // lo stato locale resterebbe congelato al valore del primo render, ignorando i nuovi dati.
  // Adeguamento durante il render (pattern consigliato da React per "adjusting state when a prop
  // changes"), non in un useEffect: evita un giro di render in più e il lint react-hooks relativo.
  const [risultatoInizialePrecedente, setRisultatoInizialePrecedente] = useState(risultatoIniziale);
  if (risultatoIniziale !== risultatoInizialePrecedente) {
    setRisultatoInizialePrecedente(risultatoIniziale);
    setRisultato(risultatoIniziale);
    setMesiOrizzonte(mesiOrizzonteIniziale);
    setMesiIndietro(0);
    setMesiAvanti(mesiOrizzonteIniziale.length);
  }

  async function ricarica(nuovoFiltro: Filtro, nuovoMesiIndietro: number, nuovoMesiAvanti: number) {
    setFiltro(nuovoFiltro);
    setMesiIndietro(nuovoMesiIndietro);
    setMesiAvanti(nuovoMesiAvanti);
    setLoading(true);
    setErrore("");
    try {
      const res = await fetch(`/api/previsionale?filtro=${nuovoFiltro}&mesi=${nuovoMesiAvanti}&mesiIndietro=${nuovoMesiIndietro}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setRisultato(data);
      setMesiOrizzonte(data.mesiOrizzonte);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }

  const reparti = [...new Set(risultato.righe.map(r => r.reparto))];
  const perCella = new Map<string, RigaAggregata>();
  for (const r of risultato.righe) perCella.set(`${r.reparto}|${r.mese}`, r);

  const totaliMese = new Map<string, RigaTotaleAzienda>();
  for (const t of risultato.totaliAzienda) totaliMese.set(t.mese, t);

  const righeMetriche: { label: string; get: (t: RigaTotaleAzienda) => number | null; unita: "h" | "€" | "persone" | "giorni"; enfasi?: boolean; firmata?: boolean }[] = [
    { label: "Capacità ordinaria MODAR", get: t => t.capacitaOrdinaria, unita: "h" },
    { label: "Capacità con straordinari", get: t => t.capacitaConStraordinari, unita: "h" },
    { label: "Ore richieste", get: t => t.oreRichieste, unita: "h" },
    { label: "Capacità residua (ordinaria − richieste)", get: t => t.capacitaResidua, unita: "h", enfasi: true, firmata: true },
    { label: "→ di cui straordinario necessario", get: t => t.oreStraordinarioNecessarie, unita: "h" },
    { label: "→ di cui ore esterne necessarie", get: t => t.oreEsterneNecessarie, unita: "h", enfasi: true },
    { label: "Numero esterni necessari", get: t => t.numeroEsterniNecessari, unita: "persone", enfasi: true },
    { label: "Giorni uomo esterni necessari", get: t => t.giorniUomoEsterniNecessari, unita: "giorni", enfasi: true },
    { label: "Costo esterni stimato", get: t => t.costoStimato, unita: "€", enfasi: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap items-center">
        {FILTRI.map(f => (
          <button
            key={f.value}
            onClick={() => ricarica(f.value, mesiIndietro, mesiAvanti)}
            disabled={loading}
            className="px-3 py-1.5 text-sm font-semibold rounded-full border disabled:opacity-60"
            style={filtro === f.value
              ? { background: "var(--color-primary)", borderColor: "var(--color-primary)", color: "white" }
              : { borderColor: "#d1d5db", color: "var(--color-grey-mid)" }}
          >
            {f.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px" style={{ background: "#e5e4e0" }} />
        <span className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Mesi passati:</span>
        {OPZIONI_MESI_INDIETRO.map(n => (
          <button
            key={n}
            onClick={() => ricarica(filtro, n, mesiAvanti)}
            disabled={loading}
            className="px-3 py-1.5 text-sm font-semibold rounded-full border disabled:opacity-60"
            style={mesiIndietro === n
              ? { background: "var(--color-black)", borderColor: "var(--color-black)", color: "white" }
              : { borderColor: "#d1d5db", color: "var(--color-grey-mid)" }}
          >
            {n === 0 ? "Nessuno" : n}
          </button>
        ))}
        <span className="mx-1 h-5 w-px" style={{ background: "#e5e4e0" }} />
        <span className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Mesi futuri:</span>
        {OPZIONI_MESI_AVANTI.map(n => (
          <button
            key={n}
            onClick={() => ricarica(filtro, mesiIndietro, n)}
            disabled={loading}
            className="px-3 py-1.5 text-sm font-semibold rounded-full border disabled:opacity-60"
            style={mesiAvanti === n
              ? { background: "var(--color-primary)", borderColor: "var(--color-primary)", color: "white" }
              : { borderColor: "#d1d5db", color: "var(--color-grey-mid)" }}
          >
            {n}
          </button>
        ))}
        {loading && <span className="text-sm self-center" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</span>}
      </div>
      {mesiIndietro > 0 && (
        <p className="text-sm -mt-3" style={{ color: "var(--color-grey-mid)" }}>
          I mesi passati usano i parametri reparto (organico, ore/giorno…) effettivamente in vigore
          in quel mese, non quelli di oggi — un mese segnato <strong>~</strong> nella tabella per
          reparto non ha uno storico esatto per quel periodo ed è mostrato con la miglior
          approssimazione disponibile.
        </p>
      )}

      {errore && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}>{errore}</div>
      )}

      <div>
        <h2 className="text-base font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-black)" }}>Vista generale</h2>
        <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
          <table className="text-base w-full border-collapse" style={{ minWidth: mesiOrizzonte.length * 90 + 220 }}>
            <thead>
              <tr className="text-sm font-semibold uppercase" style={{ color: "var(--color-grey-mid)" }}>
                <th className="text-left px-4 py-2 sticky left-0 border" style={{ background: "white", borderColor: "#e5e4e0" }}>Totale azienda</th>
                {mesiOrizzonte.map(m => (
                  <th key={m} className="text-center px-2 py-2 whitespace-nowrap border" style={{ borderColor: "#e5e4e0", ...(m < meseCorrente ? { background: "#F5F2EE" } : {}) }} title={m < meseCorrente ? "Mese passato — parametri storici" : undefined}>
                    {fmtMese(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {righeMetriche.map((rm) => {
                const richiesteRow = rm.label === "Ore richieste";
                return (
                  <tr key={rm.label}>
                    <td className="px-4 py-2 font-medium sticky left-0 whitespace-nowrap border" style={{ background: "white", borderColor: "#e5e4e0", color: rm.enfasi ? "var(--color-black)" : "var(--color-grey-mid)" }}>
                      {rm.label}
                    </td>
                    {mesiOrizzonte.map(m => {
                      const t = totaliMese.get(m)!;
                      const v = rm.get(t);

                      if (rm.firmata) {
                        const positiva = v != null && v >= 0;
                        const testo = v == null ? "—" : `${v > 0 ? "+" : ""}${round(v)}h`;
                        return (
                          <td key={m} className="text-center px-2 py-2 whitespace-nowrap tabular-nums border" style={{ borderColor: "#e5e4e0", fontWeight: 600, color: v == null ? "#d1d5db" : positiva ? "#166534" : "#991B1B" }}>
                            {testo}
                          </td>
                        );
                      }

                      if (v == null || v <= 0) return <td key={m} className="text-center px-2 py-2 text-sm border" style={{ borderColor: "#e5e4e0", color: "#d1d5db" }}>—</td>;
                      let colore = "var(--color-black)";
                      if (richiesteRow) colore = t.oreRichieste <= t.capacitaConStraordinari ? "#166534" : "#991B1B";
                      else if (rm.enfasi) colore = "#991B1B";
                      return (
                        <td key={m} className="text-center px-2 py-2 whitespace-nowrap tabular-nums border" style={{ borderColor: "#e5e4e0", fontWeight: rm.enfasi || richiesteRow ? 600 : 400, color: colore }}>
                          {rm.unita === "€" ? `€${round(v)}` : rm.unita === "persone" ? round(v) : rm.unita === "giorni" ? `${round(v)} gg` : `${round(v)}h`}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>
          Azienda trattata come un unico reparto: capacità e ore richieste sono sommate su tutti i
          reparti prima di calcolare sforo/straordinario/esterne, non dopo — utile come indicatore
          d&apos;insieme finché i dati per-reparto restano approssimativi. Per il dettaglio per reparto vedi
          la tabella sotto.
        </p>
      </div>

      <div>
        <h2 className="text-base font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-black)" }}>Vista per reparto</h2>
        <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
          <table className="text-base border-collapse" style={{ minWidth: mesiOrizzonte.length * 100 + 140 }}>
            <thead>
              <tr className="text-sm font-semibold uppercase" style={{ color: "var(--color-grey-mid)" }}>
                <th className="text-left px-4 py-2 sticky left-0 border" style={{ background: "white", borderColor: "#e5e4e0" }}>Reparto</th>
                {mesiOrizzonte.map(m => (
                  <th key={m} className="text-center px-2 py-2 whitespace-nowrap border" style={{ borderColor: "#e5e4e0", ...(m < meseCorrente ? { background: "#F5F2EE" } : {}) }} title={m < meseCorrente ? "Mese passato — parametri storici" : undefined}>
                    {fmtMese(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reparti.map(rep => (
                <tr key={rep}>
                  <td className="px-4 py-2 font-semibold sticky left-0 border" style={{ background: "white", borderColor: "#e5e4e0", color: "var(--color-black)" }}>{rep}</td>
                  {mesiOrizzonte.map(m => {
                    const c = perCella.get(`${rep}|${m}`);
                    if (!c || c.oreRichieste === 0) {
                      return <td key={m} className="text-center px-2 py-2 text-sm border" style={{ borderColor: "#e5e4e0", color: "#d1d5db" }}>—</td>;
                    }
                    const positiva = c.capacitaResidua >= 0;
                    return (
                      <td key={m} className="text-center px-2 py-2 whitespace-nowrap border" style={{ borderColor: "#e5e4e0", background: positiva ? "#F0FDF4" : "#FEF2F2" }}>
                        <div>
                          <span className="font-semibold">{round(c.oreRichieste)}h</span>
                          {c.basatoSuStima && (
                            <span className="ml-1 text-sm font-bold" style={{ color: "#92400E" }} title="Basato su dati stimati, non ancora su consuntivi reali">~</span>
                          )}
                          {c.parametriStoriciApprossimati && (
                            <span className="ml-1 text-sm font-bold" style={{ color: "#6366f1" }} title="Nessuno storico parametri risalente a prima di questo mese — mostrata la miglior approssimazione disponibile">≈</span>
                          )}
                        </div>
                        <div className="text-sm font-semibold" style={{ color: positiva ? "#166534" : "#991B1B" }}>
                          {c.capacitaResidua > 0 ? "+" : ""}{round(c.capacitaResidua)}h
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm mt-1" style={{ color: "var(--color-grey-mid)" }}>~ = basato su dati stimati (non ancora su chiusure reali) · ≈ = parametri storici approssimati (nessuno storico esatto per quel mese)</p>
      </div>

      {risultato.richiedonoInputManuale.length > 0 && (
        <div className="rounded-xl border p-4" style={{ borderColor: "#FCD34D", background: "#FFFBEB" }}>
          <h3 className="text-base font-bold mb-2" style={{ color: "#92400E" }}>
            {risultato.richiedonoInputManuale.length} riga{risultato.richiedonoInputManuale.length === 1 ? "" : "he"} senza proposta di reparto
          </h3>
          <p className="text-sm mb-2" style={{ color: "#92400E" }}>Nessun dato storico per questi articoli — non conteggiate nella tabella sopra.</p>
          <ul className="text-sm space-y-1" style={{ color: "#92400E" }}>
            {risultato.richiedonoInputManuale.map((r, i) => (
              <li key={i}>{r.cliente} · {r.codiceArticolo} · {r.orePreventivate}h</li>
            ))}
          </ul>
        </div>
      )}

      {risultato.offerteEscluse.length > 0 && (
        <div className="rounded-xl border p-4" style={{ borderColor: "#d1d5db", background: "#F5F2EE" }}>
          <h3 className="text-base font-bold mb-2" style={{ color: "var(--color-black)" }}>
            {risultato.offerteEscluse.length} offert{risultato.offerteEscluse.length === 1 ? "a esclusa" : "e escluse"} dal planner
          </h3>
          <ul className="text-sm space-y-1" style={{ color: "var(--color-grey-mid)" }}>
            {risultato.offerteEscluse.map((o, i) => (
              <li key={i}>{o.cliente} ({o.stato}) — {o.motivo}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
