"use client";

import { useEffect, useRef, useState } from "react";
import type { Area, Commessa, Scheda, SchedaUpdate } from "@/lib/types";
import FormArea from "./FormArea";
import AllegatiScheda from "./AllegatiScheda";

const STATI = [
  "Da Iniziare", "In lavorazione", "In lavorazione Esterna", "Materiale Pronto", "Verificato", "Completato",
  "In Attesa Rilavorazione", "In attesa materiale", "Produzione Bloccata", "Annullata", "Revisione UTT",
];
const PRIORITA: { v: string; l: string }[] = [
  { v: "critica", l: "Critica" }, { v: "alta", l: "Alta" }, { v: "media", l: "Media" }, { v: "bassa", l: "Bassa" },
];

const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const inputCls = "w-full text-[15.4px] px-3 py-1.5 rounded-md border focus:outline-none focus:ring-2 focus:ring-orange-300 transition-shadow bg-white";
const inputStyle = { border: "1px solid #e5e4e0", color: "var(--color-black)" };
const inputCls_disabled = " disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed";

function Titolo({ children, nota }: { children: React.ReactNode; nota?: React.ReactNode }) {
  return (
    <h3 className="flex items-baseline justify-between gap-3 mb-2 text-[12.1px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>
      <span>{children}</span>
      {nota && <span className="normal-case tracking-normal font-normal text-[13.2px]" style={{ color: "var(--color-grey-mid)" }}>{nota}</span>}
    </h3>
  );
}

// Un campo del modulo: se il valore è diverso da quello salvato si evidenzia e mostra il valore di prima.
function Campo({ label, prima, modificato, larga, children }: {
  label: string; prima?: string; modificato: boolean; larga?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg px-3 py-2 min-w-0 ${larga ? "col-span-full" : ""}`}
      style={{ background: modificato ? "#FFF7ED" : "white", border: `1px solid ${modificato ? "var(--color-primary)" : "#e5e4e0"}` }}>
      <div className="flex items-baseline justify-between gap-2 text-[12.1px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>
        <span>{label}</span>
        {modificato && (
          <span className="normal-case tracking-normal font-medium truncate" style={{ color: "#B45309" }} title={`prima: ${prima || "—"}`}>
            modificato · prima: {prima || "—"}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// Modifica della scheda direttamente nella tab Info della pagina piena, al posto del modale. I campi
// sono quelli di FormModificaScheda; gli allegati si caricano subito (non passano dal Salva).
export default function SchedaModificaInline({ scheda, puoModificareIdentita, onSalvata, onAnnulla, onAllegatiAggiornati }: {
  scheda: Scheda;
  puoModificareIdentita: boolean; // ODP e titolo (numero scheda): solo admin
  onSalvata: (updated: Scheda) => void;
  onAnnulla: () => void;
  onAllegatiAggiornati?: (s: Scheda) => void;
}) {
  const [form, setForm] = useState<SchedaUpdate>({
    odp: scheda.odp,
    numeroScheda: scheda.numeroScheda,
    commessaId: scheda.commessaId,
    statoProduzione: scheda.statoProduzione,
    dataProduzionePrevista: scheda.dataProduzionePrevista ?? "",
    dataProduzioneEffettiva: scheda.dataProduzioneEffettiva ?? "",
    note: scheda.note,
    codiceArticolo: scheda.codiceArticolo,
    posizione: scheda.posizione,
    quantita: scheda.quantita,
    noteStato: scheda.noteStato,
    areaId: scheda.areaId,
    priorita: scheda.priorita,
  });
  const [iniziale] = useState(form);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState("");

  const [commesse, setCommesse] = useState<Commessa[]>([]);
  useEffect(() => {
    fetch("/api/commesse").then((r) => r.json()).then((d) => setCommesse(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const [aree, setAree] = useState<Area[]>([]);
  const [showFormArea, setShowFormArea] = useState(false);
  useEffect(() => {
    if (!form.commessaId) return;
    fetch(`/api/aree?commessaId=${form.commessaId}`).then((r) => r.json()).then((d) => setAree(Array.isArray(d) ? d : [])).catch(() => {});
  }, [form.commessaId]);

  function set<K extends keyof SchedaUpdate>(k: K, v: SchedaUpdate[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  // Un'Area appartiene a una singola Commessa: cambiando commessa si riparte da "nessuna area".
  function cambiaCommessa(id: string) {
    set("commessaId", id || null);
    set("areaId", null);
    setAree([]);
  }

  // Verso "Completato" la data effettiva si precompila a oggi (modificabile); uscendone si svuota.
  function cambiaStato(stato: string) {
    setForm((prev) => ({
      ...prev,
      statoProduzione: stato,
      dataProduzioneEffettiva: stato !== "Completato"
        ? ""
        : (prev.dataProduzioneEffettiva || scheda.dataProduzioneEffettiva || new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" })),
    }));
  }

  const mod = (k: keyof SchedaUpdate) => norm(form[k]) !== norm(iniziale[k]);
  const chiaviModificate = (Object.keys(iniziale) as (keyof SchedaUpdate)[]).filter(mod);
  const nModifiche = chiaviModificate.length;
  const dirty = nModifiche > 0;

  const nomeCommessa = (id: string | null | undefined) => {
    const c = commesse.find((x) => x.id === id);
    return c ? `${c.numeroCommessa} — ${c.cliente}` : id ? "…" : "nessuna";
  };
  const nomeArea = (id: string | null | undefined) => aree.find((a) => a.id === id)?.nomeArredo || (id ? "…" : "nessuna");
  const fmtData = (d: unknown) => (d ? new Date(String(d)).toLocaleDateString("it-IT") : "");

  async function salva() {
    if (salvando || !dirty) return;
    const odp = (form.odp ?? "").trim();
    if (!odp) { setErrore("L'ODP non può essere vuoto."); return; }
    if (odp !== scheda.odp && !confirm(`Stai per rinominare l'ODP da "${scheda.odp}" a "${odp}". Le ore e lo storico già registrati con "${scheda.odp}" NON verranno aggiornati e resteranno collegati al vecchio codice. Continuare?`)) return;
    if ((form.commessaId ?? null) !== scheda.commessaId && !confirm("Stai per spostare questa scheda su un'altra Commessa. L'Area assegnata verrà azzerata e gli eventuali file già caricati su Drive NON verranno spostati nella cartella della nuova commessa. Continuare?")) return;
    setSalvando(true);
    setErrore("");
    try {
      const payload: SchedaUpdate = {
        ...form,
        odp,
        numeroScheda: (form.numeroScheda ?? "").trim(),
        dataProduzionePrevista: form.dataProduzionePrevista || null,
        dataProduzioneEffettiva: form.dataProduzioneEffettiva || null,
      };
      const res = await fetch(`/api/schede/${scheda.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("Errore salvataggio");
      onSalvata(await res.json());
    } catch {
      setErrore("Errore durante il salvataggio. Riprova.");
    } finally {
      setSalvando(false);
    }
  }

  function annulla() {
    if (dirty && !confirm("Ci sono modifiche non salvate. Annullarle?")) return;
    onAnnulla();
  }

  // I gestori vivono in un ref aggiornato a ogni render: i listener globali sotto si registrano una
  // volta sola ma chiamano sempre la versione corrente (con il form di adesso).
  const gestori = useRef({ salva, annulla, dirty });
  useEffect(() => { gestori.current = { salva, annulla, dirty }; });

  useEffect(() => {
    // Capture + preventDefault: lo vede prima del listener di Esc della pagina, che così non
    // naviga via mentre si sta modificando.
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void gestori.current.salva(); }
      else if (e.key === "Escape" && !document.querySelector(".fixed.inset-0")) { e.preventDefault(); gestori.current.annulla(); }
    }
    // Un link interno cliccato con modifiche in sospeso chiede conferma (i link che aprono una
    // nuova scheda, come i PDF, non fanno perdere nulla).
    function onClick(e: MouseEvent) {
      if (!gestori.current.dirty) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      if (!confirm("Ci sono modifiche non salvate. Lasciare la pagina senza salvare?")) { e.preventDefault(); e.stopPropagation(); }
    }
    function onUnload(e: BeforeUnloadEvent) { if (gestori.current.dirty) e.preventDefault(); }
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  const completato = form.statoProduzione === "Completato";

  return (
    <div className="space-y-6">
      {/* Barra fissa sotto la navbar: conta le modifiche e tiene Salva/Annulla sempre a portata */}
      <div className="sticky z-40 -mx-6 -mt-5 px-6 py-2.5 flex items-center gap-3 flex-wrap border-b"
        style={{ top: 59, background: "#FFF7ED", borderColor: "#FDBA74" }} role="status">
        <span className="font-semibold text-[15.4px]">
          Stai modificando la scheda · {nModifiche === 0 ? "nessuna modifica" : nModifiche === 1 ? "1 modifica non salvata" : `${nModifiche} modifiche non salvate`}
        </span>
        <span className="text-[13.2px]" style={{ color: "var(--color-grey-mid)" }}>Gli allegati si caricano subito, non serve salvare.</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="hidden xl:inline text-[13.2px]" style={{ color: "var(--color-grey-mid)" }}>Esc annulla · ⌘S salva</span>
          <button type="button" onClick={annulla}
            className="px-3 py-1.5 rounded-lg text-[13.2px] font-medium border bg-white hover:bg-gray-50" style={{ borderColor: "#d1d5db", color: "var(--color-grey-mid)" }}>
            Annulla
          </button>
          <button type="button" onClick={() => void salva()} disabled={!dirty || salvando}
            className="px-4 py-1.5 rounded-lg text-[13.2px] font-semibold text-white disabled:opacity-45" style={{ background: "var(--color-primary)" }}>
            {salvando ? "Salvataggio…" : "Salva modifiche"}
          </button>
        </span>
      </div>
      {errore && <p className="text-[15.4px] font-medium" style={{ color: "#DC2626" }}>{errore}</p>}

      <section>
        <Titolo>Identificazione</Titolo>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
          <Campo label="ODP" modificato={mod("odp")} prima={norm(iniziale.odp)}>
            <input className={`${inputCls}${inputCls_disabled} font-mono`} style={inputStyle} value={form.odp ?? ""} onChange={(e) => set("odp", e.target.value)}
              disabled={!puoModificareIdentita} title={puoModificareIdentita ? undefined : "Solo l'admin può modificare l'ODP"} />
            {!puoModificareIdentita && <p className="text-[12.1px] mt-1" style={{ color: "var(--color-grey-mid)" }}>Solo l&apos;admin può modificarlo.</p>}
            {mod("odp") && <p className="text-[12.1px] mt-1" style={{ color: "#991B1B" }}>Ore e storico già registrati restano collegati al vecchio ODP.</p>}
          </Campo>
          <Campo label="Numero scheda" modificato={mod("numeroScheda")} prima={norm(iniziale.numeroScheda)}>
            <input className={`${inputCls}${inputCls_disabled}`} style={inputStyle} value={form.numeroScheda ?? ""} onChange={(e) => set("numeroScheda", e.target.value)}
              disabled={!puoModificareIdentita} title={puoModificareIdentita ? undefined : "Solo l'admin può modificare il titolo"} />
            {!puoModificareIdentita && <p className="text-[12.1px] mt-1" style={{ color: "var(--color-grey-mid)" }}>Solo l&apos;admin può modificarlo.</p>}
          </Campo>
          <Campo label="Codice articolo" modificato={mod("codiceArticolo")} prima={norm(iniziale.codiceArticolo)}>
            <input className={`${inputCls} font-mono`} style={inputStyle} value={form.codiceArticolo ?? ""} onChange={(e) => set("codiceArticolo", e.target.value)} />
          </Campo>
          <Campo label="Posizione" modificato={mod("posizione")} prima={norm(iniziale.posizione)}>
            <input className={inputCls} style={inputStyle} value={form.posizione ?? ""} onChange={(e) => set("posizione", e.target.value)} />
          </Campo>
          <Campo label="Quantità" modificato={mod("quantita")} prima={norm(iniziale.quantita)}>
            <input type="number" min="0" className={inputCls} style={inputStyle} value={form.quantita ?? ""} onChange={(e) => set("quantita", e.target.value === "" ? null : Number(e.target.value))} />
          </Campo>
          <Campo label="Priorità (APS)" modificato={mod("priorita")} prima={PRIORITA.find((p) => p.v === iniziale.priorita)?.l ?? norm(iniziale.priorita)}>
            <select className={inputCls} style={inputStyle} value={form.priorita ?? "media"} onChange={(e) => set("priorita", e.target.value as SchedaUpdate["priorita"])}>
              {PRIORITA.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
          </Campo>
        </div>
      </section>

      <section>
        <Titolo>Collegamenti</Titolo>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          <Campo label="Commessa" modificato={mod("commessaId")} prima={nomeCommessa(iniziale.commessaId)}>
            <select className={inputCls} style={inputStyle} value={form.commessaId ?? ""} onChange={(e) => cambiaCommessa(e.target.value)}>
              <option value="">— nessuna —</option>
              {commesse.map((c) => <option key={c.id} value={c.id}>{c.numeroCommessa} — {c.cliente}{c.localita ? ` (${c.localita})` : ""}</option>)}
            </select>
            {mod("commessaId") && (
              <p className="text-[12.1px] mt-1" style={{ color: "#991B1B" }}>I file già caricati su Drive restano nella cartella della vecchia commessa.</p>
            )}
          </Campo>
          <Campo label="Area / Cartella" modificato={mod("areaId")} prima={nomeArea(iniziale.areaId)}>
            <div className="flex gap-2">
              <select className={inputCls} style={inputStyle} value={form.areaId ?? ""} onChange={(e) => set("areaId", e.target.value || null)} disabled={!form.commessaId}>
                <option value="">— nessuna —</option>
                {aree.map((a) => <option key={a.id} value={a.id}>{a.nomeArredo || "—"}</option>)}
              </select>
              <button type="button" onClick={() => setShowFormArea(true)} disabled={!form.commessaId}
                className="px-3 rounded-md border text-[13.2px] font-semibold whitespace-nowrap disabled:opacity-50" style={{ color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.3)" }}>
                + Nuova
              </button>
            </div>
            {!form.commessaId && <p className="text-[12.1px] mt-1" style={{ color: "var(--color-grey-mid)" }}>Assegna prima una Commessa per collegare un&apos;Area.</p>}
          </Campo>
        </div>
      </section>

      <section>
        <Titolo nota="Fornitore, stato esterno e date di uscita/rientro stanno nella tab «Fornitore Esterno».">Stato e date</Titolo>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
          <Campo label="Stato produzione" modificato={mod("statoProduzione")} prima={norm(iniziale.statoProduzione)}>
            <select className={inputCls} style={inputStyle} value={form.statoProduzione ?? ""} onChange={(e) => cambiaStato(e.target.value)}>
              <option value="">— nessuno —</option>
              {STATI.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {form.statoProduzione === "In lavorazione Esterna" && (
              <p className="text-[12.5px] mt-1.5 rounded px-2 py-1" style={{ background: "#EEF2FF", color: "#4338CA" }}>
                {scheda.fornitore ? `Giro attivo: ${scheda.fornitore}. ` : "Nessun fornitore indicato. "}Gestiscilo dalla tab <b>Fornitore Esterno</b>.
              </p>
            )}
          </Campo>
          <Campo label="Produzione prevista" modificato={mod("dataProduzionePrevista")} prima={fmtData(iniziale.dataProduzionePrevista)}>
            <input type="date" className={inputCls} style={inputStyle} value={form.dataProduzionePrevista ?? ""} onChange={(e) => set("dataProduzionePrevista", e.target.value)} />
          </Campo>
          {completato && (
            <Campo label="Produzione effettiva" modificato={mod("dataProduzioneEffettiva")} prima={fmtData(iniziale.dataProduzioneEffettiva)}>
              <input type="date" className={inputCls} style={inputStyle} value={form.dataProduzioneEffettiva ?? ""} onChange={(e) => set("dataProduzioneEffettiva", e.target.value)} />
              <p className="text-[12.1px] mt-1" style={{ color: "var(--color-grey-mid)" }}>Base del Lead Time. Se vuota, al salvataggio diventa oggi.</p>
            </Campo>
          )}
          <Campo larga label="Note stato" modificato={mod("noteStato")} prima={norm(iniziale.noteStato)}>
            <textarea rows={2} className={`${inputCls} resize-y`} style={inputStyle} value={form.noteStato ?? ""} onChange={(e) => set("noteStato", e.target.value)} />
          </Campo>
        </div>
      </section>

      <section>
        <Titolo>Descrizione / Fasi</Titolo>
        <div className="grid">
          <Campo label="Descrizione" modificato={mod("note")} prima={norm(iniziale.note).slice(0, 60)}>
            <textarea rows={4} className={`${inputCls} resize-y`} style={inputStyle} value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
          </Campo>
        </div>
      </section>

      <section>
        <Titolo nota="trascina i file su una casella oppure usa «Aggiungi»">Allegati</Titolo>
        <AllegatiScheda scheda={scheda} onAggiornata={onAllegatiAggiornati} />
      </section>

      {showFormArea && form.commessaId && (
        <FormArea
          commessaId={form.commessaId}
          onClose={() => setShowFormArea(false)}
          onSaved={(area) => { setAree((p) => [...p, area]); set("areaId", area.id); setShowFormArea(false); }}
        />
      )}
    </div>
  );
}
