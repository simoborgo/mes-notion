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

interface PresenteRow {
  matricola: string;
  cognome: string;
  nome: string;
  azienda: string;
  reparto: string;
  tipo: string;
  assenza: Assenza | null;
  ultimoOdp: string | null;
  registrazioni: RegistrazioneRow[];
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

const inputCls = "rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

export default function VistaOggi() {
  const [data, setData] = useState(oggiStr());
  const [presenti, setPresenti] = useState<PresenteRow[]>([]);
  const [odpList, setOdpList] = useState<OdpAttivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [ordinaPerReparto, setOrdinaPerReparto] = useState(false);
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [totaleGiornata, setTotaleGiornata] = useState(DEFAULT_TOTALE_GIORNATA);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

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

  const presentiOrdinati = useMemo(() => {
    const arr = [...presenti];
    if (ordinaPerReparto) arr.sort((a, b) => a.reparto.localeCompare(b.reparto) || a.cognome.localeCompare(b.cognome));
    else arr.sort((a, b) => a.cognome.localeCompare(b.cognome));
    return arr;
  }, [presenti, ordinaPerReparto]);

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
          <input type="checkbox" checked={ordinaPerReparto} onChange={e => setOrdinaPerReparto(e.target.checked)} className="accent-orange-500" />
          Ordina per reparto
        </label>
      </div>

      <h2 className="text-lg font-semibold" style={{ color: "var(--color-black)" }}>{fmtDataLunga(data)}</h2>

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
      ) : presentiOrdinati.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessun operatore in forza trovato.</p>
      ) : (
        <div className="space-y-2">
          {presentiOrdinati.map(p => (
            <RigaOperatore
              key={p.matricola}
              p={p}
              odpList={odpList}
              totaleGiornata={totaleGiornata}
              selezionato={selezionati.has(p.matricola)}
              onToggleSelezionato={() => toggleSelezionato(p.matricola)}
              onSalva={voce => salvaVoce(voce)}
              onElimina={eliminaVoce}
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

function RigaOperatore({
  p, odpList, totaleGiornata, selezionato, onToggleSelezionato, onSalva, onElimina,
}: {
  p: PresenteRow;
  odpList: OdpAttivo[];
  totaleGiornata: number;
  selezionato: boolean;
  onToggleSelezionato: () => void;
  onSalva: (voce: { matricola: string; cognome: string; nome: string; azienda: string | null; reparto: string | null; odp: string; ore: number; rif: boolean; causale: Causale | null; note: string | null }) => Promise<void>;
  onElimina: (id: string) => Promise<void>;
}) {
  const totaleOre = p.registrazioni.reduce((s, r) => s + r.ore, 0);
  const oltreLimite = totaleOre > 11;
  const rimanenti = Math.max(arrotondaMezzo(totaleGiornata - totaleOre), 0);
  const giornataCompleta = rimanenti <= 0;

  const [odp, setOdp] = useState<string | null>(p.ultimoOdp);
  // null = segui il residuo calcolato; un numero = l'utente ha digitato un valore proprio
  const [oreOverride, setOreOverride] = useState<number | null>(null);
  const ore = oreOverride ?? rimanenti;
  const [rif, setRif] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

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
      setOdp(null);
      setRif(false);
      setOreOverride(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSaving(false);
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
                ⚠ {totaleOre}h/giorno
              </span>
            )}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
            {p.azienda} · {p.reparto}
          </div>
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
          <OdpAutocomplete odpList={odpList} value={odp} onChange={setOdp} placeholder="Cerca ODP…" />
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
          title={giornataCompleta ? `Giornata completa (${totaleGiornata}h) — elimina una voce per aggiungerne altre` : "Aggiungi riga"}
          className="flex items-center justify-center rounded-lg text-white font-bold disabled:opacity-60 flex-shrink-0"
          style={{ width: 44, height: 44, background: "var(--color-primary)", fontSize: 20 }}
        >
          {saving ? "…" : "+"}
        </button>
      </div>
      {giornataCompleta && !err && (
        <p className="px-4 pb-3 text-xs font-medium" style={{ color: "#92400E" }}>
          Giornata completa ({totaleGiornata}h) — elimina una voce per aggiungerne altre
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
