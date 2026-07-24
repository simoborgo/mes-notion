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

  const caricaPresenti = useCallback(async (dataStr: string) => {
    setLoading(true);
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
      setLoading(false);
    }
  }, []);

  useEffect(() => { caricaPresenti(data); setSelezionati(new Set()); }, [data, caricaPresenti]);

  useEffect(() => {
    fetch("/api/ore/odp-list").then(r => r.json()).then(setOdpList).catch(() => {});
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
    await caricaPresenti(data);
  }

  async function eliminaVoce(id: string) {
    const res = await fetch(`/api/ore/registrazioni/${id}`, { method: "DELETE" });
    if (!res.ok) { setErrore("Errore eliminazione"); return; }
    await caricaPresenti(data);
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
    await caricaPresenti(data);
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
          odpList={odpList}
          onAssegna={assegnaBulk}
          onAnnulla={() => setSelezionati(new Set())}
        />
      )}
    </div>
  );
}

function RigaOperatore({
  p, odpList, selezionato, onToggleSelezionato, onSalva, onElimina,
}: {
  p: PresenteRow;
  odpList: OdpAttivo[];
  selezionato: boolean;
  onToggleSelezionato: () => void;
  onSalva: (voce: { matricola: string; cognome: string; nome: string; azienda: string | null; reparto: string | null; odp: string; ore: number; rif: boolean; causale: Causale | null; note: string | null }) => Promise<void>;
  onElimina: (id: string) => Promise<void>;
}) {
  const [aggiungendo, setAggiungendo] = useState(false);
  const totaleOre = p.registrazioni.reduce((s, r) => s + r.ore, 0);
  const oltreLimite = totaleOre > 11;

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: p.assenza ? "#FCA5A5" : "#e5e4e0", background: p.assenza ? "#FEF2F2" : "white" }}>
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
        <button
          onClick={() => setAggiungendo(v => !v)}
          className="text-sm font-semibold px-3 py-1.5 rounded-lg border hover:bg-orange-50 flex-shrink-0"
          style={{ color: "var(--color-primary)", borderColor: "var(--color-primary)" }}
        >
          {aggiungendo ? "✕ Chiudi" : "+ Aggiungi ODP"}
        </button>
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

      {aggiungendo && (
        <FormAggiungiOdp
          odpList={odpList}
          ultimoOdp={p.ultimoOdp}
          onAnnulla={() => setAggiungendo(false)}
          onSalva={async voce => {
            await onSalva({
              matricola: p.matricola, cognome: p.cognome, nome: p.nome,
              azienda: p.azienda, reparto: p.reparto, ...voce,
            });
            setAggiungendo(false);
          }}
        />
      )}
    </div>
  );
}

function FormAggiungiOdp({
  odpList, ultimoOdp, onSalva, onAnnulla,
}: {
  odpList: OdpAttivo[];
  ultimoOdp: string | null;
  onSalva: (voce: { odp: string; ore: number; rif: boolean; causale: Causale | null; note: string | null }) => Promise<void>;
  onAnnulla: () => void;
}) {
  const [odp, setOdp] = useState<string | null>(ultimoOdp);
  const [ore, setOre] = useState(9);
  const [rif, setRif] = useState(false);
  const [causale, setCausale] = useState<Causale | "">("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleSalva() {
    if (!odp) { setErr("Seleziona un ODP"); return; }
    if (!(ore > 0)) { setErr("Ore non valide"); return; }
    setSaving(true);
    setErr("");
    try {
      await onSalva({ odp, ore, rif, causale: rif && causale ? causale : null, note: null });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 pb-4 pt-1 border-t space-y-3" style={{ borderColor: "#e5e4e0" }}>
      <OdpAutocomplete odpList={odpList} value={odp} onChange={setOdp} />
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold" style={{ color: "var(--color-grey-mid)" }}>Ore</label>
          <input
            type="number" step={0.5} min={0.5} className={inputCls}
            style={{ width: 90, height: 44 }}
            value={ore} onChange={e => setOre(Number(e.target.value))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={rif} onChange={e => setRif(e.target.checked)} className="w-4 h-4 accent-red-600" />
          <span className="font-semibold" style={{ color: rif ? "#991B1B" : "var(--color-black)" }}>RIF (rifacimento)</span>
        </label>
        {rif && (
          <select
            className={inputCls}
            style={{ height: 44 }}
            value={causale}
            onChange={e => setCausale(e.target.value as Causale | "")}
          >
            <option value="">Causale (opzionale)</option>
            <option value="P">P — Progettazione</option>
            <option value="T">T — Taglio/Lavorazione</option>
            <option value="M">M — Materiale</option>
            <option value="C">C — Cliente</option>
          </select>
        )}
      </div>
      {err && <p className="text-xs font-medium" style={{ color: "#991B1B" }}>{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleSalva}
          disabled={saving}
          className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
          style={{ background: saving ? "var(--color-grey-mid)" : "var(--color-primary)" }}
        >
          {saving ? "Salvataggio…" : "Salva"}
        </button>
        <button onClick={onAnnulla} className="px-4 py-2 text-sm font-medium rounded-lg border hover:bg-gray-50">
          Annulla
        </button>
      </div>
    </div>
  );
}

function BulkAssegnaBar({
  count, odpList, onAssegna, onAnnulla,
}: {
  count: number;
  odpList: OdpAttivo[];
  onAssegna: (odp: string, ore: number) => Promise<void>;
  onAnnulla: () => void;
}) {
  const [odp, setOdp] = useState<string | null>(null);
  const [ore, setOre] = useState(9);
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
      className="fixed bottom-0 left-0 right-0 border-t shadow-lg z-40"
      style={{ background: "white", borderColor: "#e5e4e0" }}
    >
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold flex-shrink-0" style={{ color: "var(--color-black)" }}>
          {count} selezionat{count === 1 ? "o" : "i"}
        </span>
        <div style={{ minWidth: 220, flex: 1 }}>
          <OdpAutocomplete odpList={odpList} value={odp} onChange={setOdp} placeholder="ODP da assegnare a tutti…" />
        </div>
        <input
          type="number" step={0.5} min={0.5} className={inputCls}
          style={{ width: 90, height: 48 }}
          value={ore} onChange={e => setOre(Number(e.target.value))}
        />
        <button
          onClick={handleAssegna}
          disabled={saving || !odp}
          className="px-4 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
          style={{ background: "var(--color-primary)" }}
        >
          {saving ? "Assegnazione…" : "Assegna a tutti"}
        </button>
        <button onClick={onAnnulla} className="px-3 py-2.5 text-sm font-medium rounded-lg border hover:bg-gray-50">
          Annulla
        </button>
      </div>
    </div>
  );
}
