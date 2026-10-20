"use client";

import { useEffect, useState } from "react";
import type { Scheda, SchedaUpdate, Area, Commessa } from "@/lib/types";
import FormArea from "./FormArea";
import AllegatiScheda from "./AllegatiScheda";

const STATI = [
  "Da Iniziare",
  "In lavorazione",
  "In lavorazione Esterna",
  "Materiale Pronto",
  "Verificato",
  "Completato",
  "In Attesa Rilavorazione",
  "In attesa materiale",
  "Produzione Bloccata",
  "Annullata",
  "Revisione UTT",
];

interface Props {
  scheda: Scheda;
  onClose: () => void;
  onSave: (updated: Scheda) => void;
}

export default function FormModificaScheda({ scheda, onClose, onSave }: Props) {
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
  const [initialForm] = useState(form);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [commesse, setCommesse] = useState<Commessa[]>([]);
  useEffect(() => {
    fetch(`/api/commesse`).then(r => r.json()).then((data) => setCommesse(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const [aree, setAree] = useState<Area[]>([]);
  const [showFormArea, setShowFormArea] = useState(false);
  useEffect(() => {
    if (!form.commessaId) return;
    fetch(`/api/aree?commessaId=${form.commessaId}`).then(r => r.json()).then((data) => setAree(Array.isArray(data) ? data : [])).catch(() => {});
  }, [form.commessaId]);

  function handleCommessaChange(id: string) {
    // Un'Area appartiene a una singola Commessa: cambiando commessa quella già selezionata
    // non ha più senso, si riparte da "nessuna" e si ricarica la lista sopra (o si svuota qui
    // se la nuova commessa è vuota — l'effect sopra non chiama fetch in quel caso).
    set("commessaId", id || null);
    set("areaId", null);
    setAree([]);
  }

  function handleAreaCreata(area: Area) {
    setAree((prev) => [...prev, area]);
    set("areaId", area.id);
    setShowFormArea(false);
  }

  function set<K extends keyof SchedaUpdate>(k: K, v: SchedaUpdate[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  // Portando lo stato a "Completato" la data effettiva si precompila a oggi (modificabile);
  // uscendo da "Completato" si svuota, coerente con l'azzeramento lato server.
  function handleStatoChange(stato: string) {
    setForm((prev) => ({
      ...prev,
      statoProduzione: stato,
      dataProduzioneEffettiva: stato !== "Completato"
        ? ""
        : (prev.dataProduzioneEffettiva || scheda.dataProduzioneEffettiva || new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" })),
    }));
  }

  function handleClose() {
    if (isDirty && !confirm("Ci sono modifiche non salvate. Chiudere comunque senza salvare?")) return;
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const odp = (form.odp ?? "").trim();
    if (!odp) { setError("L'ODP non può essere vuoto."); return; }
    if (odp !== scheda.odp && !confirm(`Stai per rinominare l'ODP da "${scheda.odp}" a "${odp}". Le ore e lo storico già registrati con "${scheda.odp}" NON verranno aggiornati e resteranno collegati al vecchio codice. Continuare?`)) {
      return;
    }
    if ((form.commessaId ?? null) !== scheda.commessaId && !confirm(`Stai per spostare questa scheda su un'altra Commessa. L'Area assegnata verrà azzerata e gli eventuali file già caricati su Drive NON verranno spostati nella cartella della nuova commessa. Continuare?`)) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: SchedaUpdate = {
        ...form,
        odp,
        numeroScheda: (form.numeroScheda ?? "").trim(),
        dataProduzionePrevista: form.dataProduzionePrevista || null,
        dataProduzioneEffettiva: form.dataProduzioneEffettiva || null,
      };
      const res = await fetch(`/api/schede/${scheda.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      const updated: Scheda = await res.json();
      onSave(updated);
    } catch {
      setError("Errore durante il salvataggio. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300";
  const labelCls = "block text-xs font-medium mb-1";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={handleClose}>
      <div
        className="w-full max-w-4xl bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]"
        style={{ borderRadius: "var(--radius-modal)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-base">Modifica Scheda</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
              {scheda.odp} — {scheda.numeroScheda}
            </p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>ODP</label>
              <input type="text" className={inputCls} value={form.odp ?? ""} onChange={(e) => set("odp", e.target.value)} />
              <p className="text-xs mt-1" style={{ color: "#991B1B" }}>
                Correggi solo per un inserimento errato/doppio: le ore e lo storico già registrati restano collegati al vecchio ODP.
              </p>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Numero Scheda</label>
              <input type="text" className={inputCls} value={form.numeroScheda ?? ""} onChange={(e) => set("numeroScheda", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Codice Articolo</label>
              <input type="text" className={inputCls} value={form.codiceArticolo ?? ""} onChange={(e) => set("codiceArticolo", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Posizione</label>
              <input type="text" className={inputCls} value={form.posizione ?? ""} onChange={(e) => set("posizione", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Quantità</label>
              <input type="number" min="0" className={inputCls} value={form.quantita ?? ""} onChange={(e) => set("quantita", e.target.value === "" ? null : Number(e.target.value))} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Priorità (APS)</label>
              <select className={inputCls} value={form.priorita ?? "media"} onChange={(e) => set("priorita", e.target.value as SchedaUpdate["priorita"])}>
                <option value="critica">Critica</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="bassa">Bassa</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Commessa</label>
            <select className={inputCls} value={form.commessaId ?? ""} onChange={(e) => handleCommessaChange(e.target.value)}>
              <option value="">— nessuna —</option>
              {commesse.map((c) => (
                <option key={c.id} value={c.id}>{c.numeroCommessa} — {c.cliente}{c.localita ? ` (${c.localita})` : ""}</option>
              ))}
            </select>
            {(form.commessaId ?? null) !== scheda.commessaId && (
              <p className="text-xs mt-1" style={{ color: "#991B1B" }}>
                Correggi solo per un inserimento sulla commessa sbagliata: i file già caricati su Drive restano nella cartella della vecchia commessa.
              </p>
            )}
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Area / Cartella</label>
            <div className="flex gap-2">
              <select className={inputCls} value={form.areaId ?? ""} onChange={(e) => set("areaId", e.target.value || null)} disabled={!form.commessaId}>
                <option value="">— nessuna —</option>
                {aree.map((a) => (
                  <option key={a.id} value={a.id}>{a.nomeArredo || "—"}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowFormArea(true)}
                disabled={!form.commessaId}
                className="px-3 py-2 text-sm rounded border font-medium whitespace-nowrap hover:bg-gray-50 transition-colors disabled:opacity-50"
                style={{ color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.3)" }}
              >
                + Nuova
              </button>
            </div>
            {!form.commessaId && (
              <p className="text-xs mt-1" style={{ color: "var(--color-grey-mid)" }}>Assegna prima una Commessa per poter collegare un&apos;Area.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Stato Produzione</label>
              <select className={inputCls} value={form.statoProduzione} onChange={(e) => handleStatoChange(e.target.value)}>
                <option value="">— nessuno —</option>
                {STATI.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Produzione Prevista</label>
              <input type="date" className={inputCls} value={form.dataProduzionePrevista ?? ""} onChange={(e) => set("dataProduzionePrevista", e.target.value)} />
            </div>
          </div>

          {form.statoProduzione === "Completato" && (
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Produzione Effettiva</label>
              <input type="date" className={inputCls} value={form.dataProduzioneEffettiva ?? ""} onChange={(e) => set("dataProduzioneEffettiva", e.target.value)} />
              <p className="text-xs mt-1" style={{ color: "var(--color-grey-mid)" }}>
                Giorno in cui si è concluso il ciclo (base del Lead Time). Lasciata vuota, al salvataggio viene impostata a oggi.
              </p>
            </div>
          )}

          <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
            Fornitore, stato produzione esterna, date di uscita/rientro e Ordine Fornitore si gestiscono dalla tab &quot;Fornitore Esterno&quot;.
          </p>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Note Stato</label>
            <textarea rows={2} className={inputCls + " resize-none"} value={form.noteStato ?? ""} onChange={(e) => set("noteStato", e.target.value)} />
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Descrizione</label>
            <textarea rows={3} className={inputCls + " resize-none"} value={form.note} onChange={(e) => set("note", e.target.value)} />
          </div>

          <AllegatiScheda scheda={scheda} />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={handleClose} className="px-4 py-2 text-sm rounded border font-medium hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm rounded font-medium text-white transition-colors disabled:opacity-60"
              style={{ background: saving ? "var(--color-grey-mid)" : "var(--color-primary)", borderRadius: "var(--radius-button)" }}
            >
              {saving ? "Salvataggio…" : "Salva"}
            </button>
          </div>
        </form>
      </div>
      {showFormArea && form.commessaId && (
        <FormArea
          commessaId={form.commessaId}
          onClose={() => setShowFormArea(false)}
          onSaved={handleAreaCreata}
        />
      )}
    </div>
  );
}
