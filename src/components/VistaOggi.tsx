"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { OdpAttivo } from "@/lib/types";
import OdpAutocomplete from "./OdpAutocomplete";

type Causale = "P" | "T" | "M" | "C";

interface RegistrazioneRow {
  id: string;
  data: string;
  matricola: string;
  odp: string;
  categoria: string;
  ore: number;
  rif: boolean;
  causale: Causale | null;
  note: string | null;
}

interface Assenza {
  tipo: "PERMESSO" | "FERIE";
  dataInizio: string;
  dataFine: string;
  oraInizio: string | null;
  oraFine: string | null;
}

interface AssenzaManuale {
  ore: number | null; // null = intera giornata
  modificataManualmente: boolean;
  conflitto: boolean;
  permessoOreSuggerite: number | null;
}

interface PresenteRow {
  matricola: string;
  cognome: string;
  nome: string;
  azienda: string;
  reparto: string;
  tipo: string;
  assenza: Assenza | null;
  assenzaManuale: AssenzaManuale | null;
  odpGiornoPrecedente: string | null;
  registrazioni: RegistrazioneRow[];
}

interface OperatoreDerivato {
  p: PresenteRow;
  totaleRegistrato: number;
  oreAssenza: number;
  rimanenti: number;
  giornataCompleta: boolean;
}

interface SezioneDerivata {
  reparto: string;
  operatori: OperatoreDerivato[];
  capacitaNetta: number;
  oreRegistrate: number;
  residuo: number;
}

// Giornata standard attuale — in futuro spostabile in una pagina di configurazioni
const DEFAULT_TOTALE_GIORNATA = 9.5;

function oggiStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

function fmtDataLunga(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const raw = dt.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function arrotondaMezzo(n: number): number {
  return Math.round(n * 2) / 2;
}

// Ore da togliere dal conteggio per via dell'assenza — null = intera giornata, risolto sul valore
// di "totale giornata" corrente (impostabile dall'utente nel navigatore in alto).
function oreAssenzaEffettiva(a: AssenzaManuale | null, totaleGiornata: number): number {
  if (!a) return 0;
  return a.ore ?? totaleGiornata;
}

const inputCls = "rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

export default function VistaOggi() {
  const [data, setData] = useState(oggiStr());
  const [presenti, setPresenti] = useState<PresenteRow[]>([]);
  const [odpList, setOdpList] = useState<OdpAttivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [totaleGiornata, setTotaleGiornata] = useState(DEFAULT_TOTALE_GIORNATA);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [preselezionaUltimoOdp, setPreselezionaUltimoOdp] = useState(true);

  // mostraLoading=false per i ricaricamenti dopo salvataggio/eliminazione: evita che
  // l'intera lista sparisca dietro "Caricamento…" (smontando/rimontando ogni riga) a ogni
  // singolo inserimento — percepito come "refresh della pagina". Solo il cambio data mostra
  // il loader pieno.
  const caricaPresenti = useCallback(async (dataStr: string, mostraLoading = true) => {
    if (mostraLoading) setLoading(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/ore/presenti?data=${dataStr}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore caricamento");
      setPresenti(json.presenti);
      setWarning(json.warningPermessi);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      if (mostraLoading) setLoading(false);
    }
  }, []);

  useEffect(() => { caricaPresenti(data); setSelezionati(new Set()); setTotaleGiornata(DEFAULT_TOTALE_GIORNATA); }, [data, caricaPresenti]);

  useEffect(() => {
    fetch("/api/ore/odp-list")
      .then(async r => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error ?? `Errore ${r.status}`);
        return json;
      })
      .then(json => setOdpList(Array.isArray(json) ? json : []))
      .catch(e => {
        console.error("[VistaOggi] odp-list:", e);
        setErrore(e instanceof Error ? e.message : "Errore caricamento elenco ODP");
      });
  }, []);

  // Derivata da odpList (stessa fonte dell'autocomplete: ODP_SPECIALI in src/lib/notion.ts)
  // invece di una lista propria, per non poterla mai disallineare dai tag realmente accettati.
  const tagSpeciali = useMemo(() => odpList.filter(o => o.isSpeciale), [odpList]);

  // Un solo giro di calcolo per operatore/reparto/globale — evitare di ripetere le stesse
  // somme in ogni RigaOperatore e in ogni header di sezione.
  const sezioni = useMemo<SezioneDerivata[]>(() => {
    const perReparto = new Map<string, PresenteRow[]>();
    for (const p of presenti) {
      const list = perReparto.get(p.reparto) ?? [];
      list.push(p);
      perReparto.set(p.reparto, list);
    }
    const reparti = [...perReparto.keys()].sort((a, b) => a.localeCompare(b));
    return reparti.map(reparto => {
      const operatori: OperatoreDerivato[] = perReparto.get(reparto)!
        .slice()
        .sort((a, b) => a.cognome.localeCompare(b.cognome))
        .map(p => {
          const totaleRegistrato = p.registrazioni.reduce((s, r) => s + r.ore, 0);
          const oreAssenza = oreAssenzaEffettiva(p.assenzaManuale, totaleGiornata);
          const rimanenti = Math.max(arrotondaMezzo(totaleGiornata - oreAssenza - totaleRegistrato), 0);
          return { p, totaleRegistrato, oreAssenza, rimanenti, giornataCompleta: rimanenti <= 0 };
        });
      const capacitaLorda = operatori.length * totaleGiornata;
      const oreAssenzaTot = operatori.reduce((s, o) => s + o.oreAssenza, 0);
      const capacitaNetta = arrotondaMezzo(capacitaLorda - oreAssenzaTot);
      const oreRegistrate = arrotondaMezzo(operatori.reduce((s, o) => s + o.totaleRegistrato, 0));
      const residuo = arrotondaMezzo(capacitaNetta - oreRegistrate);
      return { reparto, operatori, capacitaNetta, oreRegistrate, residuo };
    });
  }, [presenti, totaleGiornata]);

  const globale = useMemo(() => {
    const capacitaNetta = arrotondaMezzo(sezioni.reduce((s, sez) => s + sez.capacitaNetta, 0));
    const oreRegistrate = arrotondaMezzo(sezioni.reduce((s, sez) => s + sez.oreRegistrate, 0));
    const nOperatori = sezioni.reduce((s, sez) => s + sez.operatori.length, 0);
    const residuo = arrotondaMezzo(capacitaNetta - oreRegistrate);
    return { capacitaNetta, oreRegistrate, nOperatori, residuo };
  }, [sezioni]);

  function toggleSelezionato(matricola: string) {
    setSelezionati(prev => {
      const next = new Set(prev);
      if (next.has(matricola)) next.delete(matricola); else next.add(matricola);
      return next;
    });
  }

  async function salvaVoce(voce: {
    matricola: string; cognome: string; nome: string; azienda: string | null; reparto: string | null;
    odp: string; ore: number; rif: boolean; causale: Causale | null; note: string | null;
  }) {
    const res = await fetch("/api/ore/registrazioni", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voci: [{ data, ...voce }] }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Errore salvataggio");
    await caricaPresenti(data, false);
  }

  async function eliminaVoce(id: string) {
    const res = await fetch(`/api/ore/registrazioni/${id}`, { method: "DELETE" });
    if (!res.ok) { setErrore("Errore eliminazione"); return; }
    await caricaPresenti(data, false);
  }

  async function salvaAssenza(matricola: string, ore: number | null) {
    const res = await fetch("/api/ore/assenze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, matricola, ore }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Errore salvataggio assenza");
    await caricaPresenti(data, false);
  }

  async function eliminaAssenza(matricola: string) {
    const res = await fetch(`/api/ore/assenze?data=${data}&matricola=${matricola}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Errore rimozione assenza");
    await caricaPresenti(data, false);
  }

  async function assegnaBulk(odp: string, ore: number) {
    const operatori = presenti.filter(p => selezionati.has(p.matricola));
    const voci = operatori.map(p => ({
      data, matricola: p.matricola, cognome: p.cognome, nome: p.nome,
      azienda: p.azienda, reparto: p.reparto, odp, ore, rif: false, causale: null, note: null,
    }));
    const res = await fetch("/api/ore/registrazioni", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voci }),
    });
    const json = await res.json();
    if (!res.ok) { setErrore(json.error ?? "Errore assegnazione multipla"); return; }
    setSelezionati(new Set());
    setBulkModalOpen(false);
    await caricaPresenti(data, false);
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Legenda causali speciali — cosa digitare nel campo ODP quando non si tratta di una commessa */}
      {tagSpeciali.length > 0 && (
        <div
          className="rounded-lg border px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2"
          style={{ borderColor: "#FDE8D0", background: "#FFF7ED" }}
        >
          <span className="text-xs font-bold uppercase tracking-wide flex-shrink-0" style={{ color: "var(--color-primary)" }}>
            Causali speciali
          </span>
          {tagSpeciali.map(t => (
            <span key={t.odp} className="flex items-center gap-1.5 text-xs">
              <span
                className="font-mono font-bold px-1.5 py-0.5 rounded"
                style={{ background: "white", border: "1px solid #FDE8D0", color: "var(--color-black)" }}
              >
                {t.odp}
              </span>
              <span style={{ color: "var(--color-grey-mid)" }}>
                {t.label.includes(" — ") ? t.label.split(" — ")[1] : t.label}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Day navigator */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setData(d => addDays(d, -1))}
          className="flex items-center justify-center rounded-lg border hover:bg-gray-50"
          style={{ width: 44, height: 44, borderColor: "#d1d5db" }}
        >‹</button>
        <input
          type="date"
          className={inputCls}
          style={{ height: 44 }}
          value={data}
          onChange={e => setData(e.target.value)}
        />
        <button
          onClick={() => setData(d => addDays(d, 1))}
          className="flex items-center justify-center rounded-lg border hover:bg-gray-50"
          style={{ width: 44, height: 44, borderColor: "#d1d5db" }}
        >›</button>
        <button
          onClick={() => setData(oggiStr())}
          className="px-3 rounded-lg border text-sm font-semibold hover:bg-gray-50"
          style={{ height: 44, borderColor: "#d1d5db", color: "var(--color-grey-mid)" }}
        >Oggi</button>
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <span style={{ color: "var(--color-grey-mid)" }}>Totale giornata</span>
          <input
            type="number" step={0.5} min={0}
            className={inputCls}
            style={{ width: 68, height: 36 }}
            value={totaleGiornata}
            onChange={e => setTotaleGiornata(Number(e.target.value))}
          />
          <span style={{ color: "var(--color-grey-mid)" }}>h</span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={preselezionaUltimoOdp} onChange={e => setPreselezionaUltimoOdp(e.target.checked)} className="accent-orange-500" />
          Preseleziona ODP in lavorazione dal giorno precedente
        </label>
      </div>

      <h2 className="text-lg font-semibold" style={{ color: "var(--color-black)" }}>{fmtDataLunga(data)}</h2>

      {!loading && presenti.length > 0 && (
        <div
          className="rounded-lg px-4 py-2.5 text-sm font-semibold flex items-center gap-2"
          style={globale.residuo <= 0
            ? { background: "#DCFCE7", color: "#166534", border: "1px solid #86EFAC" }
            : { background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}
        >
          {globale.residuo <= 0
            ? "Giornata chiusa ✓ — tutte le ore attese sono state registrate"
            : `⚠ Mancano ancora ${globale.residuo}h su ${globale.nOperatori} operatori per chiudere la giornata`}
        </div>
      )}

      {warning && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#FFFBEB", border: "1px solid #FCD34D", color: "#92400E" }}>
          ⚠ {warning} — le assenze non sono verificate per questa data, tutti gli operatori risultano presenti.
        </div>
      )}
      {errore && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}>
          {errore}
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</p>
      ) : sezioni.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessun operatore in forza trovato.</p>
      ) : (
        <div className="space-y-6">
          {sezioni.map(sez => (
            <SezioneReparto
              key={sez.reparto}
              sez={sez}
              odpList={odpList}
              totaleGiornata={totaleGiornata}
              preselezionaUltimoOdp={preselezionaUltimoOdp}
              selezionati={selezionati}
              onToggleSelezionato={toggleSelezionato}
              onSalva={salvaVoce}
              onElimina={eliminaVoce}
              onSalvaAssenza={salvaAssenza}
              onEliminaAssenza={eliminaAssenza}
            />
          ))}
        </div>
      )}

      {selezionati.size > 0 && (
        <BulkAssegnaBar
          count={selezionati.size}
          onOpenModal={() => setBulkModalOpen(true)}
          onAnnulla={() => setSelezionati(new Set())}
        />
      )}

      {bulkModalOpen && (
        <BulkAssegnaModal
          count={selezionati.size}
          odpList={odpList}
          totaleGiornata={totaleGiornata}
          onAssegna={assegnaBulk}
          onClose={() => setBulkModalOpen(false)}
        />
      )}
    </div>
  );
}

function SezioneReparto({
  sez, odpList, totaleGiornata, preselezionaUltimoOdp, selezionati, onToggleSelezionato, onSalva, onElimina, onSalvaAssenza, onEliminaAssenza,
}: {
  sez: SezioneDerivata;
  odpList: OdpAttivo[];
  totaleGiornata: number;
  preselezionaUltimoOdp: boolean;
  selezionati: Set<string>;
  onToggleSelezionato: (matricola: string) => void;
  onSalva: (voce: { matricola: string; cognome: string; nome: string; azienda: string | null; reparto: string | null; odp: string; ore: number; rif: boolean; causale: Causale | null; note: string | null }) => Promise<void>;
  onElimina: (id: string) => Promise<void>;
  onSalvaAssenza: (matricola: string, ore: number | null) => Promise<void>;
  onEliminaAssenza: (matricola: string) => Promise<void>;
}) {
  const chiusa = sez.residuo <= 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2 px-1">
        <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--color-black)" }}>
          {sez.reparto}
          <span className="font-normal normal-case ml-2" style={{ color: "var(--color-grey-mid)" }}>
            · {sez.operatori.length} operator{sez.operatori.length === 1 ? "e" : "i"}
          </span>
        </h3>
        <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: "var(--color-grey-mid)" }}>
          <span>capacità {sez.capacitaNetta}h · registrate {sez.oreRegistrate}h</span>
          <span
            className="font-bold px-2 py-0.5 rounded-full"
            style={chiusa ? { background: "#DCFCE7", color: "#166534" } : { background: "#FEF3C7", color: "#92400E" }}
          >
            {chiusa ? "Chiuso ✓" : `Mancano ${sez.residuo}h`}
          </span>
        </div>
      </div>
      <div className="space-y-2">
        {sez.operatori.map(o => (
          <RigaOperatore
            key={o.p.matricola}
            p={o.p}
            odpList={odpList}
            totaleGiornata={totaleGiornata}
            preselezionaUltimoOdp={preselezionaUltimoOdp}
            totaleRegistrato={o.totaleRegistrato}
            oreAssenza={o.oreAssenza}
            rimanenti={o.rimanenti}
            giornataCompleta={o.giornataCompleta}
            selezionato={selezionati.has(o.p.matricola)}
            onToggleSelezionato={() => onToggleSelezionato(o.p.matricola)}
            onSalva={onSalva}
            onElimina={onElimina}
            onSalvaAssenza={ore => onSalvaAssenza(o.p.matricola, ore)}
            onEliminaAssenza={() => onEliminaAssenza(o.p.matricola)}
          />
        ))}
      </div>
    </div>
  );
}

function RigaOperatore({
  p, odpList, totaleGiornata, preselezionaUltimoOdp, totaleRegistrato, oreAssenza, rimanenti, giornataCompleta,
  selezionato, onToggleSelezionato, onSalva, onElimina, onSalvaAssenza, onEliminaAssenza,
}: {
  p: PresenteRow;
  odpList: OdpAttivo[];
  totaleGiornata: number;
  preselezionaUltimoOdp: boolean;
  totaleRegistrato: number;
  oreAssenza: number;
  rimanenti: number;
  giornataCompleta: boolean;
  selezionato: boolean;
  onToggleSelezionato: () => void;
  onSalva: (voce: { matricola: string; cognome: string; nome: string; azienda: string | null; reparto: string | null; odp: string; ore: number; rif: boolean; causale: Causale | null; note: string | null }) => Promise<void>;
  onElimina: (id: string) => Promise<void>;
  onSalvaAssenza: (ore: number | null) => Promise<void>;
  onEliminaAssenza: () => Promise<void>;
}) {
  const oltreLimite = totaleRegistrato > 11;

  // undefined = non ancora toccato dall'utente, segue la spunta "preseleziona";
  // null/stringa = scelta esplicita dell'utente (selezione, cancellazione o dopo un salvataggio)
  const [odpOverride, setOdpOverride] = useState<string | null | undefined>(undefined);
  const odp = odpOverride !== undefined ? odpOverride : (preselezionaUltimoOdp ? p.odpGiornoPrecedente : null);
  // null = segui il residuo calcolato; un numero = l'utente ha digitato un valore proprio
  const [oreOverride, setOreOverride] = useState<number | null>(null);
  const ore = oreOverride ?? rimanenti;
  const [rif, setRif] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Assenza manuale: undefined = segue p.assenzaManuale (server), un numero = modifica in corso non ancora salvata
  const [oreAssenzaOverride, setOreAssenzaOverride] = useState<number | undefined>(undefined);
  const [savingAssenza, setSavingAssenza] = useState(false);
  const [errAssenza, setErrAssenza] = useState("");
  const assenzaManuale = p.assenzaManuale;
  const assenteChecked = assenzaManuale !== null;
  const assenzaSincronizzata = assenzaManuale?.modificataManualmente === false;
  const oreAssenzaVisualizzate = oreAssenzaOverride !== undefined
    ? oreAssenzaOverride
    : (assenzaManuale ? (assenzaManuale.ore ?? totaleGiornata) : totaleGiornata);

  async function handleAggiungi() {
    if (!odp) { setErr("Seleziona un ODP"); return; }
    if (!(ore > 0)) { setErr("Ore non valide"); return; }
    setSaving(true);
    setErr("");
    try {
      await onSalva({
        matricola: p.matricola, cognome: p.cognome, nome: p.nome,
        azienda: p.azienda, reparto: p.reparto,
        odp, ore, rif, causale: null, note: null,
      });
      setOdpOverride(null);
      setRif(false);
      setOreOverride(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleAssenza(checked: boolean) {
    setSavingAssenza(true);
    setErrAssenza("");
    try {
      if (checked) {
        await onSalvaAssenza(null); // default: intera giornata
      } else {
        await onEliminaAssenza();
      }
      setOreAssenzaOverride(undefined);
    } catch (e) {
      setErrAssenza(e instanceof Error ? e.message : "Errore assenza");
    } finally {
      setSavingAssenza(false);
    }
  }

  async function handleBlurOreAssenza() {
    if (oreAssenzaOverride === undefined) return; // non modificato
    setSavingAssenza(true);
    setErrAssenza("");
    try {
      const oreDaSalvare = oreAssenzaOverride === totaleGiornata ? null : oreAssenzaOverride;
      await onSalvaAssenza(oreDaSalvare);
      setOreAssenzaOverride(undefined);
    } catch (e) {
      setErrAssenza(e instanceof Error ? e.message : "Errore assenza");
    } finally {
      setSavingAssenza(false);
    }
  }

  return (
    <div className="rounded-xl border" style={{ borderColor: p.assenza ? "#FCA5A5" : "#e5e4e0", background: p.assenza ? "#FEF2F2" : "white" }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <input type="checkbox" checked={selezionato} onChange={onToggleSelezionato} className="w-5 h-5 accent-orange-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold" style={{ color: "var(--color-black)" }}>{p.cognome} {p.nome}</span>
            {p.assenza && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#FEE2E2", color: "#991B1B" }}>
                {p.assenza.tipo === "FERIE" ? "In ferie" : "In permesso"}
              </span>
            )}
            {oltreLimite && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#92400E" }}>
                ⚠ {totaleRegistrato}h/giorno
              </span>
            )}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
            {p.azienda} · {p.reparto}
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            <label
              className="flex items-center gap-1.5 text-xs cursor-pointer"
              title={assenzaSincronizzata ? "Assenza da Gestione Permessi — per rimuoverla, modifica la richiesta in Permessi" : undefined}
            >
              <input
                type="checkbox"
                checked={assenteChecked}
                disabled={assenzaSincronizzata || savingAssenza}
                onChange={e => handleToggleAssenza(e.target.checked)}
                className="w-3.5 h-3.5 accent-orange-500"
              />
              <span style={{ color: "var(--color-grey-mid)" }}>Assente per malattia o permesso</span>
            </label>
            {assenteChecked && (
              <>
                <input
                  type="number" step={0.5} min={0.5} max={totaleGiornata}
                  className={inputCls}
                  style={{ width: 64, height: 28 }}
                  value={oreAssenzaVisualizzate}
                  disabled={savingAssenza}
                  onChange={e => setOreAssenzaOverride(Number(e.target.value))}
                  onBlur={handleBlurOreAssenza}
                />
                <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>h da togliere dal conteggio</span>
              </>
            )}
            {assenzaManuale?.conflitto && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#92400E" }}>
                ⚠ verifica: mismatch con permessi ({assenzaManuale.permessoOreSuggerite != null ? `Permessi indica ${assenzaManuale.permessoOreSuggerite}h` : "Permessi indica giornata intera"})
              </span>
            )}
          </div>
          {errAssenza && <p className="text-xs font-medium mt-1" style={{ color: "#991B1B" }}>{errAssenza}</p>}
        </div>
      </div>

      {p.registrazioni.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {p.registrazioni.map(r => (
            <div
              key={r.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "#F5F2EE", color: "var(--color-black)" }}
            >
              <span className="font-semibold">{r.odp}</span>
              <span>{r.ore}h</span>
              {r.rif && (
                <span className="font-bold" style={{ color: "#991B1B" }}>
                  RIF{r.causale ? ` (${r.causale})` : " — da classificare"}
                </span>
              )}
              <button onClick={() => onElimina(r.id)} className="text-gray-400 hover:text-gray-600 leading-none">×</button>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 pb-3 pt-1 border-t flex items-center gap-2 flex-wrap" style={{ borderColor: "#e5e4e0" }}>
        <div style={{ minWidth: 200, flex: 1 }}>
          <OdpAutocomplete odpList={odpList} value={odp} onChange={setOdpOverride} placeholder="Cerca ODP…" />
        </div>
        <input
          type="number" step={0.5} min={0} className={inputCls}
          style={{ width: 76, height: 44 }}
          value={ore} onChange={e => setOreOverride(Number(e.target.value))}
          title="Ore (residuo suggerito, modificabile)"
        />
        <label className="flex items-center gap-1.5 text-xs cursor-pointer flex-shrink-0">
          <input type="checkbox" checked={rif} onChange={e => setRif(e.target.checked)} className="w-3.5 h-3.5 accent-red-600" />
          <span className="font-semibold" style={{ color: rif ? "#991B1B" : "var(--color-grey-mid)" }}>RIF</span>
        </label>
        <button
          onClick={handleAggiungi}
          disabled={saving || giornataCompleta}
          title={giornataCompleta ? `Giornata completa (${totaleGiornata}h considerando eventuali assenze) — elimina una voce per aggiungerne altre` : "Aggiungi riga"}
          className="flex items-center justify-center rounded-lg text-white font-bold disabled:opacity-60 flex-shrink-0"
          style={{ width: 44, height: 44, background: "var(--color-primary)", fontSize: 20 }}
        >
          {saving ? "…" : "+"}
        </button>
      </div>
      {giornataCompleta && !err && (
        <p className="px-4 pb-3 text-xs font-medium" style={{ color: "#92400E" }}>
          Giornata completa ({totaleGiornata}h{oreAssenza > 0 ? `, di cui ${oreAssenza}h di assenza` : ""}) — elimina una voce per aggiungerne altre
        </p>
      )}
      {err && <p className="px-4 pb-3 text-xs font-medium" style={{ color: "#991B1B" }}>{err}</p>}
    </div>
  );
}

function BulkAssegnaBar({
  count, onOpenModal, onAnnulla,
}: {
  count: number;
  onOpenModal: () => void;
  onAnnulla: () => void;
}) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 border-t shadow-lg z-40"
      style={{ background: "white", borderColor: "#e5e4e0" }}
    >
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold flex-shrink-0" style={{ color: "var(--color-black)" }}>
          {count} selezionat{count === 1 ? "o" : "i"}
        </span>
        <button
          onClick={onOpenModal}
          className="ml-auto px-4 py-2.5 text-sm font-semibold text-white rounded-lg"
          style={{ background: "var(--color-primary)" }}
        >
          Assegna ODP a tutti →
        </button>
        <button onClick={onAnnulla} className="px-3 py-2.5 text-sm font-medium rounded-lg border hover:bg-gray-50">
          Annulla
        </button>
      </div>
    </div>
  );
}

function BulkAssegnaModal({
  count, odpList, totaleGiornata, onAssegna, onClose,
}: {
  count: number;
  odpList: OdpAttivo[];
  totaleGiornata: number;
  onAssegna: (odp: string, ore: number) => Promise<void>;
  onClose: () => void;
}) {
  const [odp, setOdp] = useState<string | null>(null);
  const [ore, setOre] = useState(totaleGiornata);
  const [saving, setSaving] = useState(false);

  async function handleAssegna() {
    if (!odp) return;
    setSaving(true);
    try {
      await onAssegna(odp, ore);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl p-5 space-y-4"
        style={{ background: "white" }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold" style={{ color: "var(--color-black)" }}>
          Assegna ODP a {count} operator{count === 1 ? "e" : "i"}
        </h3>
        <OdpAutocomplete odpList={odpList} value={odp} onChange={setOdp} placeholder="Cerca ODP…" />
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold" style={{ color: "var(--color-grey-mid)" }}>Ore</label>
          <input
            type="number" step={0.5} min={0.5} className={inputCls}
            style={{ width: 90, height: 44 }}
            value={ore} onChange={e => setOre(Number(e.target.value))}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium rounded-lg border hover:bg-gray-50">
            Annulla
          </button>
          <button
            onClick={handleAssegna}
            disabled={saving || !odp}
            className="px-4 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
            style={{ background: "var(--color-primary)" }}
          >
            {saving ? "Assegnazione…" : "Assegna a tutti"}
          </button>
        </div>
      </div>
    </div>
  );
}
