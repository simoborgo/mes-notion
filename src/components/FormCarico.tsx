"use client";

import { useState } from "react";
import type { Carico, Commessa } from "@/lib/types";

const MODALITA = ["Gomma", "Aerea", "Nave"];
const STATI = ["Pianificato", "Confermato", "Spedito"];

interface FormState {
  titolo: string;
  descrizione: string;
  dataCarico: string;
  commessaId: string | null;
  modalita: string;
  stato: string;
}

interface Props {
  carico?: Carico | null;
  commesse: Commessa[];
  // Commessa già decisa (area di lavoro di una commessa): il campo non si può cambiare
  commessaFissa?: string | null;
  // "Nuovo carico con i selezionati": ODP da spostare nel carico appena creato
  odpIniziali?: string[];
  onClose: () => void;
  onSave: (carico: Carico, avviso?: string) => void;
}

// Solo i dati di testata del carico: gli ODP si assegnano dalla pagina Carichi ("Sposta in").
export default function FormCarico({ carico, commesse, commessaFissa, odpIniziali = [], onClose, onSave }: Props) {
  const isEdit = !!carico;
  const [initialForm] = useState<FormState>(() => ({
    titolo: carico?.titolo ?? "",
    descrizione: carico?.descrizione ?? "",
    dataCarico: carico?.dataCarico ?? "",
    commessaId: carico?.commessaId ?? commessaFissa ?? null,
    modalita: carico?.modalita ?? "",
    stato: carico?.stato ?? "Pianificato",
  }));
  const [form, setForm] = useState<FormState>(initialForm);
  // Con modifiche in corso il click fuori dal modal (es. rilasciando il mouse dopo una selezione di testo) non lo chiude
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // La commessa di un carico che ha già ODP non si cambia: gli ODP appartengono a quella commessa
  const commessaBloccata = !!commessaFissa || (isEdit && carico!.odpIds.length > 0);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titolo.trim()) { setError("Titolo obbligatorio"); return; }
    if (!form.dataCarico) { setError("Data Carico obbligatoria"); return; }
    if (!form.commessaId) { setError("Commessa obbligatoria"); return; }
    setSaving(true);
    setError("");
    try {
      const payload = {
        titolo: form.titolo.trim(),
        descrizione: form.descrizione,
        dataCarico: form.dataCarico,
        commessaId: form.commessaId,
        modalita: form.modalita || undefined,
        stato: form.stato || undefined,
      };
      const url = isEdit ? `/api/carichi/${carico!.id}` : "/api/carichi";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Errore durante il salvataggio. Riprova.");
      const saved: Carico = await res.json();

      if (!isEdit && odpIniziali.length > 0) {
        const r = await fetch("/api/carichi/sposta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ odpIds: odpIniziali, caricoId: saved.id }),
        });
        if (!r.ok) {
          const msg = (await r.json().catch(() => null))?.error ?? "spostamento non riuscito";
          onSave(saved, `Carico creato, ma gli ODP non sono stati spostati: ${msg}`);
          return;
        }
        onSave({ ...saved, odpIds: odpIniziali }, `Carico «${saved.titolo}» creato con ${odpIniziali.length} ODP.`);
        return;
      }
      onSave(saved, isEdit ? `Carico «${saved.titolo}» aggiornato.` : `Carico «${saved.titolo}» creato.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore durante il salvataggio. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:bg-gray-50 disabled:text-gray-500";
  const labelCls = "block text-xs font-medium mb-1";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={() => { if (!isDirty) onClose(); }}>
      <div
        className="w-full max-w-2xl bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]"
        style={{ borderRadius: "var(--radius-modal)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-base">{isEdit ? "Modifica Carico" : "Nuovo Carico"}</h2>
            {isEdit && <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>{carico!.titolo}</p>}
            {!isEdit && odpIniziali.length > 0 && (
              <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>Alla conferma ci entrano i {odpIniziali.length} ODP selezionati</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Chiudi">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="carico-titolo" className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Titolo</label>
              <input id="carico-titolo" type="text" className={inputCls} value={form.titolo} onChange={(e) => set("titolo", e.target.value)} required />
            </div>
            <div>
              <label htmlFor="carico-data" className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Carico</label>
              <input id="carico-data" type="date" className={inputCls} value={form.dataCarico} onChange={(e) => set("dataCarico", e.target.value)} required />
            </div>
          </div>

          <div>
            <label htmlFor="carico-descrizione" className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Descrizione</label>
            <textarea id="carico-descrizione" rows={2} className={inputCls + " resize-none"} value={form.descrizione} onChange={(e) => set("descrizione", e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="carico-commessa" className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Commessa</label>
              <select id="carico-commessa" className={inputCls} value={form.commessaId ?? ""} disabled={commessaBloccata} onChange={(e) => set("commessaId", e.target.value || null)}>
                <option value="">— scegli —</option>
                {commesse.map((c) => (
                  <option key={c.id} value={c.id}>{c.numeroCommessa} — {c.cliente}</option>
                ))}
              </select>
              {isEdit && carico!.odpIds.length > 0 && !commessaFissa && (
                <p className="text-xs mt-1" style={{ color: "var(--color-grey-mid)" }}>Il carico ha già degli ODP: la commessa non si può cambiare.</p>
              )}
            </div>
            <div>
              <label htmlFor="carico-modalita" className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Modalità</label>
              <select id="carico-modalita" className={inputCls} value={form.modalita} onChange={(e) => set("modalita", e.target.value)}>
                <option value="">— nessuna —</option>
                {MODALITA.map((m) => <option key={m} value={m}>{m}</option>)}
                {form.modalita && !MODALITA.includes(form.modalita) && <option value={form.modalita}>{form.modalita}</option>}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="carico-stato" className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Stato</label>
            <select id="carico-stato" className={inputCls} value={form.stato} onChange={(e) => set("stato", e.target.value)}>
              {STATI.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded border font-medium hover:bg-gray-50 transition-colors">
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
    </div>
  );
}
