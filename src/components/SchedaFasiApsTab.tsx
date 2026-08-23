"use client";

import { useEffect, useState } from "react";
import type { Scheda } from "@/lib/types";
import type { SchedaFase } from "@/lib/schedeFasiRepository";
import type { PatternCiclo } from "@/lib/patternCicloRepository";

const selectCls = "rounded-lg border px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";
const inputCls = "rounded-lg border px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

// Locali (mai new Date(isoString)/toISOString) — stesso accorgimento già usato in GanttAps.tsx.
function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(iso: string, n: number): string {
  const d = toDate(iso);
  const nuovo = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${nuovo.getFullYear()}-${p(nuovo.getMonth() + 1)}-${p(nuovo.getDate())}`;
}
function diffGiorni(iniIso: string, fineIso: string): number {
  return Math.round((toDate(fineIso).getTime() - toDate(iniIso).getTime()) / 86_400_000);
}

// Traduzione leggibile di MotivoNonGenerato (src/lib/schedeFasiRepository.ts) — senza questa
// mappa l'utente vedeva solo "Impossibile generare le fasi", senza sapere perché.
const MOTIVI_ERRORE: Record<string, string> = {
  tipologia_non_supportata: "solo le Schede (non Sottoschede/Rilavorazioni) hanno fasi APS",
  fasi_gia_presenti: "le fasi esistono già per questa Scheda",
  codice_articolo_mancante: "manca il Codice Articolo sulla Scheda",
  pattern_non_risolvibile: "nessun pattern selezionato o valido",
};

export default function SchedaFasiApsTab({ scheda }: { scheda: Scheda }) {
  const [fasi, setFasi] = useState<SchedaFase[] | null>(null);
  const [pattern, setPattern] = useState<PatternCiclo[] | null>(null);
  const [patternScelto, setPatternScelto] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [iniziandoId, setIniziandoId] = useState<string | null>(null);
  const [completandoId, setCompletandoId] = useState<string | null>(null);
  const [escludendoId, setEscludendoId] = useState<string | null>(null);
  const [oreInput, setOreInput] = useState<Record<string, string>>({});
  const [salvandoOreId, setSalvandoOreId] = useState<string | null>(null);
  const [inizioInput, setInizioInput] = useState<Record<string, string>>({});
  const [pianificandoId, setPianificandoId] = useState<string | null>(null);
  const [sbloccandoId, setSbloccandoId] = useState<string | null>(null);

  function carica() {
    return fetch(`/api/schede/${scheda.id}/fasi`)
      .then(r => r.json())
      .then((data) => { if (Array.isArray(data)) setFasi(data); });
  }

  useEffect(() => {
    let annullato = false;
    Promise.all([
      fetch(`/api/schede/${scheda.id}/fasi`).then(r => r.json()),
      fetch(`/api/pattern-ciclo`).then(r => r.json()),
    ])
      .then(([fasiData, patternData]) => {
        if (annullato) return;
        if (Array.isArray(fasiData)) setFasi(fasiData);
        if (Array.isArray(patternData)) setPattern(patternData);
      })
      .catch((e) => { if (!annullato) setErrore(e instanceof Error ? e.message : "Errore caricamento fasi APS"); });
    return () => { annullato = true; };
  }, [scheda.id]);

  async function generaFasi() {
    setGenerando(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/schede/${scheda.id}/fasi/genera`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patternId: patternScelto || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ? `${data.error}${data.motivo ? ` (${MOTIVI_ERRORE[data.motivo] ?? data.motivo})` : ""}` : `Errore ${res.status}`);
      await carica();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore generazione fasi");
    } finally {
      setGenerando(false);
    }
  }

  async function iniziaFase(faseId: string) {
    setIniziandoId(faseId);
    setErrore(null);
    try {
      const res = await fetch(`/api/schede/${scheda.id}/fasi/${faseId}/inizia`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      if (Array.isArray(data)) setFasi(data);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore avvio fase");
    } finally {
      setIniziandoId(null);
    }
  }

  async function completaFase(faseId: string) {
    setCompletandoId(faseId);
    setErrore(null);
    try {
      const res = await fetch(`/api/schede/${scheda.id}/fasi/${faseId}/completa`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      if (Array.isArray(data)) setFasi(data);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore completamento fase");
    } finally {
      setCompletandoId(null);
    }
  }

  function valoreOre(f: SchedaFase): string {
    return oreInput[f.id] ?? (f.oreStimate != null ? String(f.oreStimate) : "");
  }

  async function salvaOre(f: SchedaFase) {
    const oreStimate = Number(valoreOre(f));
    if (!Number.isFinite(oreStimate) || oreStimate <= 0) return;
    setSalvandoOreId(f.id);
    setErrore(null);
    try {
      const res = await fetch(`/api/schede/${scheda.id}/fasi/${f.id}/stima`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oreStimate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      if (Array.isArray(data)) setFasi(data);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore impostazione stima ore");
    } finally {
      setSalvandoOreId(null);
    }
  }

  function valoreInizio(f: SchedaFase): string {
    return inizioInput[f.id] ?? f.dataInizioPianificata ?? "";
  }

  // Pianificazione manuale (Fase 9) da tastiera — stessa API del drag&drop sul Gantt: preserva
  // la durata attuale (dataFine - dataInizio, o 1 giorno se la fase non è ancora pianificata),
  // trasla entrambe le date del delta scelto.
  async function pianificaData(f: SchedaFase) {
    const nuovaInizio = valoreInizio(f);
    if (!nuovaInizio) return;
    const durata = f.dataInizioPianificata && f.dataFinePianificata
      ? diffGiorni(f.dataInizioPianificata, f.dataFinePianificata)
      : 0;
    setPianificandoId(f.id);
    setErrore(null);
    try {
      const res = await fetch(`/api/schede/${scheda.id}/fasi/${f.id}/pianifica-manuale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataInizio: nuovaInizio, dataFine: addDays(nuovaInizio, durata) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      if (Array.isArray(data)) setFasi(data);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore pianificazione manuale");
    } finally {
      setPianificandoId(null);
    }
  }

  async function sbloccaFase(faseId: string) {
    setSbloccandoId(faseId);
    setErrore(null);
    try {
      const res = await fetch(`/api/schede/${scheda.id}/fasi/${faseId}/sblocca-pianificazione`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      if (Array.isArray(data)) setFasi(data);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore sblocco pianificazione");
    } finally {
      setSbloccandoId(null);
    }
  }

  async function escludiFase(faseId: string, esclusa: boolean) {
    setEscludendoId(faseId);
    setErrore(null);
    try {
      const res = await fetch(`/api/schede/${scheda.id}/fasi/${faseId}/escludi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ esclusa }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      if (Array.isArray(data)) setFasi(data);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore esclusione fase");
    } finally {
      setEscludendoId(null);
    }
  }

  if (!scheda.codiceArticolo) {
    return (
      <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
        Imposta un Codice Articolo su questa Scheda (tab Info) per generare le fasi APS.
      </p>
    );
  }
  if (!fasi || !pattern) {
    return <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</p>;
  }

  if (fasi.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
          Nessuna fase generata. L&apos;articolo <b>{scheda.codiceArticolo}</b> non ha ancora un
          Pattern di Ciclo assegnato: scegline uno per generare le fasi (verrà ricordato per le
          prossime Schede con lo stesso articolo).
        </p>
        <div className="flex items-center gap-2">
          <select className={selectCls} value={patternScelto} onChange={e => setPatternScelto(e.target.value)}>
            <option value="">— scegli un pattern —</option>
            {pattern.map(p => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
          <button
            onClick={generaFasi}
            disabled={!patternScelto || generando}
            className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
            style={{ background: "var(--color-primary)" }}
          >
            {generando ? "Genero…" : "Genera fasi"}
          </button>
        </div>
        {errore && <p className="text-sm font-medium" style={{ color: "#991B1B" }}>{errore}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
      <table className="w-full text-sm" style={{ minWidth: 520 }}>
        <thead>
          <tr className="border-b text-xs font-semibold uppercase tracking-wide" style={{ borderColor: "#e5e4e0", color: "var(--color-grey-mid)" }}>
            <th className="text-left px-3 py-2">Reparto</th>
            <th className="text-left px-2 py-2">Sotto-fase</th>
            <th className="text-left px-2 py-2">Ore stimate</th>
            <th className="text-left px-2 py-2" title="Ore reali registrate su questo ODP/reparto — solo informativo, non entra nella pianificazione">Ore consuntivate</th>
            <th className="text-left px-2 py-2">Corsia</th>
            <th className="text-left px-2 py-2">Inizio</th>
            <th className="text-left px-2 py-2">Fine</th>
            <th className="text-left px-2 py-2">Stato</th>
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {fasi.map(f => (
            <tr key={f.id} className="border-b last:border-0" style={{ borderColor: "#f0ece5", opacity: f.esclusa ? 0.5 : 1 }}>
              <td className="px-3 py-2 font-medium" style={{ color: "var(--color-black)", textDecoration: f.esclusa ? "line-through" : "none" }}>
                {f.repartoNome}
                {f.esclusa && (
                  <span className="ml-2 text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: "#E4DED3", color: "var(--color-grey-mid)" }}>
                    Esclusa
                  </span>
                )}
                {!f.esclusa && f.aRischio && (
                  <span className="ml-2 text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: "#FEE2E2", color: "#991B1B" }}>
                    A rischio
                  </span>
                )}
              </td>
              <td className="px-2 py-2" style={{ color: "var(--color-grey-mid)" }}>{f.sottoFase ?? "—"}</td>
              <td className="px-2 py-2">
                {f.esclusa || f.statoFase !== "Da iniziare" ? (
                  f.oreStimate != null ? `${f.oreStimate} h` : <span style={{ color: "var(--color-grey-mid)" }}>da stimare</span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min="0" step="0.5" className={inputCls} style={{ width: 70 }}
                      placeholder="da stimare"
                      value={valoreOre(f)}
                      onChange={e => setOreInput(prev => ({ ...prev, [f.id]: e.target.value }))}
                    />
                    <button
                      onClick={() => salvaOre(f)}
                      disabled={salvandoOreId === f.id || !(Number(valoreOre(f)) > 0)}
                      className="px-2 py-1 text-xs font-semibold rounded-lg disabled:opacity-60"
                      style={{ border: "1px solid #e5e4e0", color: "var(--color-black)" }}
                    >
                      {salvandoOreId === f.id ? "…" : "Salva"}
                    </button>
                  </div>
                )}
              </td>
              <td className="px-2 py-2" style={{ color: "var(--color-grey-mid)" }}>{f.oreConsuntivate != null ? `${f.oreConsuntivate} h` : "—"}</td>
              <td className="px-2 py-2">{f.corsia != null ? f.corsia + 1 : "—"}</td>
              <td className="px-2 py-2">
                {f.esclusa || f.statoFase !== "Da iniziare" ? (
                  f.dataInizioPianificata ? new Date(f.dataInizioPianificata).toLocaleDateString("it-IT") : "—"
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date" className={inputCls} style={{ width: 140 }}
                      value={valoreInizio(f)}
                      onChange={e => setInizioInput(prev => ({ ...prev, [f.id]: e.target.value }))}
                    />
                    <button
                      onClick={() => pianificaData(f)}
                      disabled={pianificandoId === f.id || !valoreInizio(f)}
                      className="px-2 py-1 text-xs font-semibold rounded-lg disabled:opacity-60"
                      style={{ border: "1px solid #e5e4e0", color: "var(--color-black)" }}
                    >
                      {pianificandoId === f.id ? "…" : "Pianifica"}
                    </button>
                    {f.pianificazioneManuale && (
                      <button
                        onClick={() => sbloccaFase(f.id)}
                        disabled={sbloccandoId === f.id}
                        title="Sblocca — torna a essere pianificata dal motore"
                        className="px-2 py-1 text-xs font-semibold rounded-lg disabled:opacity-60"
                        style={{ border: "1px solid #DDD6FE", color: "#6D28D9" }}
                      >
                        {sbloccandoId === f.id ? "…" : "Sblocca"}
                      </button>
                    )}
                  </div>
                )}
              </td>
              <td className="px-2 py-2">{f.dataFinePianificata ? new Date(f.dataFinePianificata).toLocaleDateString("it-IT") : "—"}</td>
              <td className="px-2 py-2">{f.statoFase}</td>
              <td className="px-2 py-2 text-right whitespace-nowrap">
                {f.esclusa ? (
                  <button
                    onClick={() => escludiFase(f.id, false)}
                    disabled={escludendoId === f.id}
                    className="px-2 py-1 text-xs font-semibold rounded-lg disabled:opacity-60"
                    style={{ border: "1px solid #e5e4e0", color: "var(--color-black)" }}
                  >
                    {escludendoId === f.id ? "…" : "Includi"}
                  </button>
                ) : (
                  <div className="flex gap-1.5 justify-end">
                    {f.statoFase === "Da iniziare" && (
                      <button
                        onClick={() => iniziaFase(f.id)}
                        disabled={iniziandoId === f.id}
                        className="px-2 py-1 text-xs font-semibold rounded-lg disabled:opacity-60"
                        style={{ border: "1px solid #e5e4e0", color: "var(--color-black)" }}
                      >
                        {iniziandoId === f.id ? "…" : "Inizia lavorazione"}
                      </button>
                    )}
                    {f.statoFase !== "Completato" && (
                      <button
                        onClick={() => completaFase(f.id)}
                        disabled={completandoId === f.id}
                        className="px-2 py-1 text-xs font-semibold rounded-lg disabled:opacity-60"
                        style={{ border: "1px solid #e5e4e0", color: "var(--color-black)" }}
                      >
                        {completandoId === f.id ? "…" : "Segna completata"}
                      </button>
                    )}
                    {f.statoFase === "Da iniziare" && (
                      <button
                        onClick={() => escludiFase(f.id, true)}
                        disabled={escludendoId === f.id}
                        className="px-2 py-1 text-xs font-semibold rounded-lg disabled:opacity-60"
                        style={{ border: "1px solid #e5e4e0", color: "var(--color-grey-mid)" }}
                      >
                        {escludendoId === f.id ? "…" : "Escludi"}
                      </button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {errore && <p className="text-sm font-medium px-3 py-2" style={{ color: "#991B1B" }}>{errore}</p>}
    </div>
  );
}
