"use client";

import { useState } from "react";
import type { Scheda, SchedaUpdate } from "@/lib/types";

const STATI = [
  "In lavorazione Interna",
  "In lavorazione Esterna",
  "Completato",
  "In attesa",
  "Annullato",
];

const STATI_ESTERNI = ["In attesa", "Spedito", "Rientrato", "Completato"];

interface Props {
  scheda: Scheda;
  onClose: () => void;
  onSave: (updated: Scheda) => void;
}

export default function FormModificaScheda({ scheda, onClose, onSave }: Props) {
  const [form, setForm] = useState<SchedaUpdate>({
    statoProduzione: scheda.statoProduzione,
    dataProduzionePrevista: scheda.dataProduzionePrevista ?? "",
    produzioneEsterna: scheda.produzioneEsterna,
    statoProdEsterna: scheda.statoProdEsterna,
    fornitore: scheda.fornitore,
    ordineFornitore: scheda.ordineFornitore,
    dataRientroPrevista: scheda.dataRientroPrevista ?? "",
    dataUscitaMateriale: scheda.dataUscitaMateriale ?? "",
    dataRientroEffettiva: scheda.dataRientroEffettiva ?? "",
    note: scheda.note,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof SchedaUpdate>(k: K, v: SchedaUpdate[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload: SchedaUpdate = {
        ...form,
        dataProduzionePrevista: form.dataProduzionePrevista || null,
        dataRientroPrevista: form.dataRientroPrevista || null,
        dataUscitaMateriale: form.dataUscitaMateriale || null,
        dataRientroEffettiva: form.dataRientroEffettiva || null,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]"
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Stato Produzione</label>
              <select className={inputCls} value={form.statoProduzione} onChange={(e) => set("statoProduzione", e.target.value)}>
                <option value="">— nessuno —</option>
                {STATI.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Produzione Prevista</label>
              <input type="date" className={inputCls} value={form.dataProduzionePrevista ?? ""} onChange={(e) => set("dataProduzionePrevista", e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="esterna"
              type="checkbox"
              checked={form.produzioneEsterna}
              onChange={(e) => set("produzioneEsterna", e.target.checked)}
              className="w-4 h-4 accent-orange-500"
            />
            <label htmlFor="esterna" className="text-sm font-medium">Produzione Esterna</label>
          </div>

          {form.produzioneEsterna && (
            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg border" style={{ background: "#faf9f7" }}>
              <div>
                <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Stato Produzione Esterna</label>
                <select className={inputCls} value={form.statoProdEsterna} onChange={(e) => set("statoProdEsterna", e.target.value)}>
                  <option value="">— nessuno —</option>
                  {STATI_ESTERNI.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Fornitore</label>
                <input type="text" className={inputCls} value={form.fornitore} onChange={(e) => set("fornitore", e.target.value)} />
              </div>
              <div>
                <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Ordine Fornitore</label>
                <input type="text" className={inputCls} value={form.ordineFornitore} onChange={(e) => set("ordineFornitore", e.target.value)} />
              </div>
              <div>
                <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Uscita Materiale</label>
                <input type="date" className={inputCls} value={form.dataUscitaMateriale ?? ""} onChange={(e) => set("dataUscitaMateriale", e.target.value)} />
              </div>
              <div>
                <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Rientro Prevista</label>
                <input type="date" className={inputCls} value={form.dataRientroPrevista ?? ""} onChange={(e) => set("dataRientroPrevista", e.target.value)} />
              </div>
              <div>
                <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Rientro Effettiva</label>
                <input type="date" className={inputCls} value={form.dataRientroEffettiva ?? ""} onChange={(e) => set("dataRientroEffettiva", e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Note</label>
            <textarea rows={3} className={inputCls + " resize-none"} value={form.note} onChange={(e) => set("note", e.target.value)} />
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
