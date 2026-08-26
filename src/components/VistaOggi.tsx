"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { OdpAttivo } from "@/lib/types";
import { REPARTI_PRODUZIONE, CATEGORIA_ODP_LABEL } from "@/lib/types";
import { ODP_SPECIALI, ATTIVITA_SPECIALI_COMMESSA } from "@/lib/attivitaSpecialiCommessa";
import OdpAutocomplete from "./OdpAutocomplete";
import OdpMultiAutocomplete from "./OdpMultiAutocomplete";

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
  reparto: string;
  codiceArticolo: string | null;
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
  repartoSecondarioSuggerito: string | null;
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

// Ore totali di default per la giornata selezionata, in base al giorno della settimana: il
// sabato ha un turno più corto e senza pausa pranzo (configurabile in Admin → Orari Turno),
// la domenica non è un giorno lavorativo standard. Restano comunque modificabili a mano.
function defaultTotaleGiornata(dateStr: string, oreFeriale: number, oreSabato: number): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).getDay(); // 0 = domenica, 6 = sabato
  if (weekday === 0) return 0;
  if (weekday === 6) return oreSabato;
  return oreFeriale;
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

function arrotondaMezzo(n: number): number {
  return Math.round(n * 2) / 2;
}

// Ore da togliere dal conteggio per via dell'assenza — null = intera giornata, risolto sul valore
// di "totale giornata" corrente (impostabile dall'utente nel navigatore in alto).
function oreAssenzaEffettiva(a: AssenzaManuale | null, totaleGiornata: number): number {
  if (!a) return 0;
  return a.ore ?? totaleGiornata;
}

// 3 livelli di scostamento capacità/ore registrate, condivisi tra header di sezione e
// banner globale: residuo positivo = mancano ore, zero = chiuso, negativo = straordinario
// (ore ricevute oltre la capacità netta — es. da un operatore polivalente corretto verso
// questo reparto, Fase 3a/3d Gestione Ore avanzato).
function badgeResiduo(residuo: number): { label: string; bg: string; color: string } {
  if (residuo > 0) return { label: `Mancano ${residuo}h`, bg: "#FEF3C7", color: "#92400E" };
  if (residuo === 0) return { label: "Chiuso ✓", bg: "#DCFCE7", color: "#166534" };
  return { label: `⚠ Straordinario +${Math.abs(residuo)}h`, bg: "#DBEAFE", color: "#1E40AF" };
}

const inputCls = "rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

export default function VistaOggi({ oreFeriale, oreSabato }: { oreFeriale: number; oreSabato: number }) {
  const [data, setData] = useState(oggiStr());
  const [presenti, setPresenti] = useState<PresenteRow[]>([]);
  const [odpList, setOdpList] = useState<OdpAttivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [totaleGiornata, setTotaleGiornata] = useState(() => defaultTotaleGiornata(oggiStr(), oreFeriale, oreSabato));
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

  useEffect(() => { caricaPresenti(data); setSelezionati(new Set()); setTotaleGiornata(defaultTotaleGiornata(data, oreFeriale, oreSabato)); }, [data, caricaPresenti, oreFeriale, oreSabato]);

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

  // Un solo giro di calcolo per operatore/reparto/globale — evitare di ripetere le stesse
  // somme in ogni RigaOperatore e in ogni header di sezione.
  const sezioni = useMemo<SezioneDerivata[]>(() => {
    const perReparto = new Map<string, PresenteRow[]>();
    for (const p of presenti) {
      const list = perReparto.get(p.reparto) ?? [];
      list.push(p);
      perReparto.set(p.reparto, list);
    }

    // Ore registrate per reparto: raggruppate per il reparto della singola riga di
    // rilevamento (eventualmente corretto per operatori polivalenti, Fase 3a), non per il
    // reparto anagrafico dell'operatore — così una correzione sposta davvero il conteggio
    // verso il reparto giusto invece di restare intrappolata nella sezione di provenienza.
    const oreRegistratePerReparto = new Map<string, number>();
    for (const p of presenti) {
      for (const r of p.registrazioni) {
        oreRegistratePerReparto.set(r.reparto, (oreRegistratePerReparto.get(r.reparto) ?? 0) + r.ore);
      }
    }

    // Un reparto può comparire solo qui (ore ricevute da un polivalente corretto) senza
    // avere operatori anagrafici assegnati: capacitaNetta resta 0, il residuo negativo che
    // ne risulta è il caso "Straordinario" — comportamento corretto, non un bug.
    const reparti = new Set([...perReparto.keys(), ...oreRegistratePerReparto.keys()]);
    return [...reparti].sort((a, b) => a.localeCompare(b)).map(reparto => {
      const operatori: OperatoreDerivato[] = (perReparto.get(reparto) ?? [])
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
      const oreRegistrate = arrotondaMezzo(oreRegistratePerReparto.get(reparto) ?? 0);
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

  // Lavoro su più ODP contemporaneamente (lotto): le ore inserite sono il totale,
  // diviso in parti uguali tra gli ODP selezionati. L'ultimo assorbe il resto
  // dell'arrotondamento (2 decimali) così la somma delle righe torna sempre esatta.
  async function salvaVoce(voce: {
    matricola: string; cognome: string; nome: string; azienda: string | null; reparto: string | null;
    odpList: string[]; ore: number; rif: boolean; causale: Causale | null; note: string | null;
  }) {
    const n = voce.odpList.length;
    const oreBase = Math.round((voce.ore / n) * 100) / 100;
    const voci = voce.odpList.map((odp, i) => ({
      data,
      matricola: voce.matricola, cognome: voce.cognome, nome: voce.nome,
      azienda: voce.azienda, reparto: voce.reparto,
      odp,
      ore: i === n - 1 ? Math.round((voce.ore - oreBase * (n - 1)) * 100) / 100 : oreBase,
      rif: voce.rif, causale: voce.causale, note: voce.note,
    }));
    const res = await fetch("/api/ore/registrazioni", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voci }),
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

  async function correggiReparto(id: string, reparto: string) {
    const res = await fetch(`/api/ore/registrazioni/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reparto }),
    });
    if (!res.ok) { setErrore("Errore correzione reparto"); return; }
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
      {/* Promemoria causali speciali — solo un reminder testuale dei prefissi/suffissi
          accettati nel campo ODP, non più l'elenco espanso per ogni commessa aperta */}
      <div
        className="rounded-lg border px-4 py-2 flex flex-col gap-1 text-xs"
        style={{ borderColor: "#FDE8D0", background: "#FFF7ED" }}
      >
        <div>
          <span className="font-bold uppercase tracking-wide" style={{ color: "var(--color-primary)" }}>
            Causali speciali —{" "}
          </span>
          <span style={{ color: "var(--color-grey-mid)" }}>
            {ODP_SPECIALI.map(s => `${s.prefix} (${s.label})`).join(" · ")}
          </span>
        </div>
        <div>
          <span className="font-bold uppercase tracking-wide" style={{ color: "var(--color-primary)" }}>
            Legate a commessa —{" "}
          </span>
          <span style={{ color: "var(--color-grey-mid)" }}>
            {ATTIVITA_SPECIALI_COMMESSA.map(a => `<commessa>-${a.suffix} (${a.label})`).join(" · ")}
          </span>
        </div>
      </div>

      {/* Day navigator — sticky sotto la navbar: con reparti/operatori lunghi da scorrere, la
          data a cui si riferisce quello che si sta guardando/modificando deve restare sempre
          visibile, altrimenti si perde il contesto scrollando verso il basso. */}
      <div className="sticky z-30 pt-2 pb-3 border-b" style={{ top: 64, background: "var(--color-offwhite)", borderColor: "#e5e4e0" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setData(d => addDays(d, -1))}
            className="flex items-center justify-center rounded-lg border hover:bg-gray-50"
            style={{ width: 44, height: 44, borderColor: "#d1d5db", background: "white" }}
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
            style={{ width: 44, height: 44, borderColor: "#d1d5db", background: "white" }}
          >›</button>
          <button
            onClick={() => setData(oggiStr())}
            className="px-3 rounded-lg border text-sm font-semibold hover:bg-gray-50"
            style={{ height: 44, borderColor: "#d1d5db", color: "var(--color-grey-mid)", background: "white" }}
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

        <h2 className="text-lg font-semibold mt-2" style={{ color: "var(--color-black)" }}>{fmtDataLunga(data)}</h2>
      </div>

      {!loading && presenti.length > 0 && (
        <div
          className="rounded-lg px-4 py-2.5 text-sm font-semibold flex items-center gap-2"
          style={globale.residuo > 0
            ? { background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }
            : globale.residuo === 0
            ? { background: "#DCFCE7", color: "#166534", border: "1px solid #86EFAC" }
            : { background: "#DBEAFE", color: "#1E40AF", border: "1px solid #93C5FD" }}
        >
          {globale.residuo > 0
            ? `⚠ Mancano ancora ${globale.residuo}h su ${globale.nOperatori} operatori per chiudere la giornata`
            : globale.residuo === 0
            ? "Giornata chiusa ✓ — tutte le ore attese sono state registrate"
            : `⚠ Straordinario: +${Math.abs(globale.residuo)}h registrate oltre la capacità netta della giornata`}
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
              onCorreggiReparto={correggiReparto}
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
  sez, odpList, totaleGiornata, preselezionaUltimoOdp, selezionati, onToggleSelezionato, onSalva, onElimina, onSalvaAssenza, onEliminaAssenza, onCorreggiReparto,
}: {
  sez: SezioneDerivata;
  odpList: OdpAttivo[];
  totaleGiornata: number;
  preselezionaUltimoOdp: boolean;
  selezionati: Set<string>;
  onToggleSelezionato: (matricola: string) => void;
  onSalva: (voce: { matricola: string; cognome: string; nome: string; azienda: string | null; reparto: string | null; odpList: string[]; ore: number; rif: boolean; causale: Causale | null; note: string | null }) => Promise<void>;
  onElimina: (id: string) => Promise<void>;
  onSalvaAssenza: (matricola: string, ore: number | null) => Promise<void>;
  onEliminaAssenza: (matricola: string) => Promise<void>;
  onCorreggiReparto: (id: string, reparto: string) => Promise<void>;
}) {
  const badge = badgeResiduo(sez.residuo);
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
            style={{ background: badge.bg, color: badge.color }}
          >
            {badge.label}
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
            onCorreggiReparto={onCorreggiReparto}
          />
        ))}
      </div>
    </div>
  );
}

function RigaOperatore({
  p, odpList, totaleGiornata, preselezionaUltimoOdp, totaleRegistrato, oreAssenza, rimanenti, giornataCompleta,
  selezionato, onToggleSelezionato, onSalva, onElimina, onSalvaAssenza, onEliminaAssenza, onCorreggiReparto,
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
  onSalva: (voce: { matricola: string; cognome: string; nome: string; azienda: string | null; reparto: string | null; odpList: string[]; ore: number; rif: boolean; causale: Causale | null; note: string | null }) => Promise<void>;
  onElimina: (id: string) => Promise<void>;
  onSalvaAssenza: (ore: number | null) => Promise<void>;
  onEliminaAssenza: () => Promise<void>;
  onCorreggiReparto: (id: string, reparto: string) => Promise<void>;
}) {
  const oltreLimite = totaleRegistrato > 11;

  // undefined = non ancora toccato dall'utente, segue la spunta "preseleziona";
  // un array (anche vuoto) = scelta esplicita dell'utente. Più ODP selezionati = lavoro
  // su un lotto: le ore inserite vengono divise in parti uguali tra loro (vedi salvaVoce).
  const [odpOverride, setOdpOverride] = useState<string[] | undefined>(undefined);
  const odpSelezionati = odpOverride !== undefined
    ? odpOverride
    : (preselezionaUltimoOdp && p.odpGiornoPrecedente ? [p.odpGiornoPrecedente] : []);
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
    if (odpSelezionati.length === 0) { setErr("Seleziona almeno un ODP"); return; }
    if (!(ore > 0)) { setErr("Ore non valide"); return; }
    setSaving(true);
    setErr("");
    try {
      await onSalva({
        matricola: p.matricola, cognome: p.cognome, nome: p.nome,
        azienda: p.azienda, reparto: p.reparto,
        odpList: odpSelezionati, ore, rif, causale: null, note: null,
      });
      setOdpOverride([]);
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

  // Verde solo se la giornata è completa E non c'è un'assenza in corso — l'assenza (rosso) resta
  // il segnale prioritario, più informativo di "ore complete" per chi scorre la lista.
  const completaSenzaAssenza = giornataCompleta && !p.assenza;

  return (
    <div
      className="rounded-xl border"
      style={{
        borderColor: p.assenza ? "#FCA5A5" : completaSenzaAssenza ? "#86EFAC" : "#e5e4e0",
        background: p.assenza ? "#FEF2F2" : completaSenzaAssenza ? "#F0FDF4" : "white",
      }}
    >
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
            {completaSenzaAssenza && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#D1FAE5", color: "#065F46" }}>
                ✓ Giornata completa
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
                className="w-3.5 h-3.5"
                style={{ accentColor: assenteChecked ? "#800020" : undefined }}
              />
              <span style={assenteChecked ? { color: "#800020", fontWeight: 700 } : { color: "var(--color-grey-mid)" }}>
                Assente per malattia o permesso
              </span>
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
            <RegistrazioneChip
              key={r.id}
              r={r}
              repartoOperatore={p.reparto}
              repartoSecondarioSuggerito={p.repartoSecondarioSuggerito}
              onElimina={onElimina}
              onCorreggiReparto={onCorreggiReparto}
            />
          ))}
        </div>
      )}

      <div className="px-4 pb-3 pt-1 border-t flex items-center gap-2 flex-wrap" style={{ borderColor: "#e5e4e0" }}>
        <div style={{ minWidth: 200, flex: 1 }}>
          <OdpMultiAutocomplete odpList={odpList} value={odpSelezionati} onChange={setOdpOverride} placeholder="Cerca ODP… (anche più di uno, per un lotto)" />
        </div>
        <input
          type="number" step={0.5} min={0} className={inputCls}
          style={{ width: 76, height: 44 }}
          value={ore} onChange={e => setOreOverride(Number(e.target.value))}
          title={odpSelezionati.length > 1 ? "Ore totali — verranno divise in parti uguali tra gli ODP selezionati" : "Ore (residuo suggerito, modificabile)"}
        />
        <label
          className="flex items-center gap-2 px-3 rounded-lg border cursor-pointer flex-shrink-0 whitespace-nowrap"
          style={{ height: 44, borderColor: rif ? "#FCA5A5" : "#d1d5db", background: rif ? "#FEF2F2" : "white" }}
        >
          <input type="checkbox" checked={rif} onChange={e => setRif(e.target.checked)} className="w-4 h-4 accent-red-600" />
          <span className="text-xs font-semibold" style={{ color: rif ? "#991B1B" : "var(--color-grey-mid)" }}>RIFACIMENTO</span>
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
      {odpSelezionati.length > 1 && ore > 0 && !err && (
        <p className="px-4 pb-3 text-xs font-medium" style={{ color: "var(--color-primary)" }}>
          Lotto di {odpSelezionati.length} ODP → {Math.round((ore / odpSelezionati.length) * 100) / 100}h ciascuno
        </p>
      )}
      {giornataCompleta && !err && (
        <p className="px-4 pb-3 text-xs font-medium" style={{ color: "#92400E" }}>
          Giornata completa ({totaleGiornata}h{oreAssenza > 0 ? `, di cui ${oreAssenza}h di assenza` : ""}) — elimina una voce per aggiungerne altre
        </p>
      )}
      {err && <p className="px-4 pb-3 text-xs font-medium" style={{ color: "#991B1B" }}>{err}</p>}
    </div>
  );
}

// Fase 3a Gestione Ore avanzato: correzione manuale del reparto sulla singola riga, per i
// pochi operatori polivalenti. repartoSecondarioSuggerito (da operatori_reparto_secondario)
// viene proposto in cima alla lista, ma resta liberamente sovrascrivibile.
function RegistrazioneChip({
  r, repartoOperatore, repartoSecondarioSuggerito, onElimina, onCorreggiReparto,
}: {
  r: RegistrazioneRow;
  repartoOperatore: string;
  repartoSecondarioSuggerito: string | null;
  onElimina: (id: string) => void;
  onCorreggiReparto: (id: string, reparto: string) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const corretta = r.reparto !== repartoOperatore;

  const opzioni = repartoSecondarioSuggerito && REPARTI_PRODUZIONE.includes(repartoSecondarioSuggerito)
    ? [repartoSecondarioSuggerito, ...REPARTI_PRODUZIONE.filter(rp => rp !== repartoSecondarioSuggerito)]
    : REPARTI_PRODUZIONE;

  async function handleChange(nuovoReparto: string) {
    setSalvando(true);
    try {
      await onCorreggiReparto(r.id, nuovoReparto);
    } finally {
      setSalvando(false);
      setEditando(false);
    }
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
      style={{ background: "#F5F2EE", color: "var(--color-black)" }}
    >
      <span className="font-semibold">{r.odp}</span>
      {r.categoria === "COMMESSA" ? (
        r.codiceArticolo ? (
          <span style={{ color: "var(--color-grey-mid)" }}>{r.codiceArticolo}</span>
        ) : (
          <span className="font-bold px-1.5 py-0.5 rounded" style={{ background: "#FEF3C7", color: "#92400E" }}>NON CLASSIFICATO</span>
        )
      ) : (
        <span style={{ color: "var(--color-grey-mid)" }}>{CATEGORIA_ODP_LABEL[r.categoria] ?? r.categoria}</span>
      )}
      <span>{r.ore}h</span>
      {r.rif && (
        <span className="font-bold" style={{ color: "#991B1B" }}>
          RIFACIMENTO{r.causale ? ` (${r.causale})` : " — da classificare"}
        </span>
      )}
      {editando ? (
        <select
          autoFocus
          value={r.reparto}
          disabled={salvando}
          onChange={e => handleChange(e.target.value)}
          onBlur={() => setEditando(false)}
          className="text-xs rounded border px-1 bg-white"
          style={{ borderColor: "#d1d5db" }}
        >
          {opzioni.map(rp => (
            <option key={rp} value={rp}>
              {rp}{rp === repartoSecondarioSuggerito ? " ★ suggerito" : ""}
            </option>
          ))}
        </select>
      ) : (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="underline decoration-dotted"
          style={corretta ? { color: "#1E40AF", fontWeight: 700 } : { color: "var(--color-grey-mid)" }}
          title="Correggi reparto (operatori polivalenti)"
        >
          {corretta ? `→ ${r.reparto}` : "reparto ▾"}
        </button>
      )}
      <button onClick={() => onElimina(r.id)} className="text-gray-400 hover:text-gray-600 leading-none">×</button>
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
