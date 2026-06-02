"use client";

import { useState } from "react";
import type { Ritiro, RitiroUpdate } from "@/lib/types";

const STATI = ["In attesa", "Confermato", "Spedito", "Consegnato", "Annullato"];
const TIPI = ["Ritiro", "Consegna"];

interface Props {
  ritiro: Ritiro;
  onClose: () => void;
  onSave: (updated: Ritiro) => void;
}

export default function FormModificaRitiro({ ritiro, onClose, onSave }: Props) {
  const [form, setForm] = useState<RitiroUpdate>({
    causale: ritiro.causale,
    descrizioneMerce: ritiro.descrizioneMerce,
    dataTrasporto: ritiro.dataTrasporto ?? "",
    tipoMovimento: ritiro.tipoMovimento,
    stato: ritiro.stato,
    urgenza: ritiro.urgenza,
    fornitore: ritiro.fornitore,
    note: ritiro.note,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof RitiroUpdate>(k: K, v: RitiroUpdate[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload: RitiroUpdate = { ...form, dataTrasporto: form.dataTrasporto || null };
      const res = await fetch(`/api/ritiri/${ritiro.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      const updated: Ritiro = await res.json();
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
        className="w-full max-w-lg bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]"
        style={{ borderRadius: "var(--radius-modal)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-base">Modifica Ritiro / Consegna</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>{ritiro.causale || ritiro.id}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Stato</label>
              <select className={inputCls} value={form.stato} onChange={(e) => set("stato", e.target.value)}>
                <option value="">— nessuno —</option>
                {STATI.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Tipo Movimento</label>
              <select className={inputCls} value={form.tipoMovimento} onChange={(e) => set("tipoMovimento", e.target.value)}>
                <option value="">— nessuno —</option>
                {TIPI.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Causale</label>
              <input type="text" className={inputCls} value={form.causale} onChange={(e) => set("causale", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Trasporto</label>
              <input type="date" className={inputCls} value={form.dataTrasporto ?? ""} onChange={(e) => set("dataTrasporto", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Fornitore</label>
              <input type="text" className={inputCls} value={form.fornitore} onChange={(e) => set("fornitore", e.target.value)} />
            </div>
            <div className="flex items-center gap-3 pt-5">
              <input id="urgenza" type="checkbox" checked={form.urgenza} onChange={(e) => set("urgenza", e.target.checked)} className="w-4 h-4 accent-orange-500" />
              <label htmlFor="urgenza" className="text-sm font-medium">Urgente</label>
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Descrizione Merce</label>
            <textarea rows={2} className={inputCls + " resize-none"} value={form.descrizioneMerce} onChange={(e) => set("descrizioneMerce", e.target.value)} />
          </div>
          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Note</label>
            <textarea rows={2} className={inputCls + " resize-none"} value={form.note} onChange={(e) => set("note", e.target.value)} />
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
