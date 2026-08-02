"use client";

import { useState } from "react";
import type { ArticoloFerramenta } from "@/lib/types";

interface Props {
  fornitori: { id: string; nome: string; codiceOs1: string }[];
  onClose: () => void;
  onCreato: (articolo: ArticoloFerramenta) => void;
}

export default function FormNuovoArticoloFerramenta({ fornitori, onClose, onCreato }: Props) {
  const [descrizione, setDescrizione] = useState("");
  const [codiceOs1, setCodiceOs1] = useState("");
  const [unitaMisura, setUnitaMisura] = useState("NR");
  const [fornitoreId, setFornitoreId] = useState("");
  const [codiceFornitore, setCodiceFornitore] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!descrizione.trim() || !codiceOs1.trim()) {
      setError("Descrizione e Codice OS1 sono obbligatori.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const fornitore = fornitori.find(f => f.id === fornitoreId);
      const res = await fetch("/api/ferramenta/articoli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descrizione: descrizione.trim(),
          codiceOs1: codiceOs1.trim(),
          unitaMisura: unitaMisura.trim(),
          fornitoreId: fornitoreId || null,
          fornitoreNomeOs1: fornitore?.nome ?? null,
          codiceFornitore: codiceFornitore.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      onCreato(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300";
  const labelCls = "block text-xs font-medium mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]"
        style={{ borderRadius: "var(--radius-modal)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-base">Nuovo articolo Ferramenta</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
              Va poi classificato (Kanban / A Pezzo) dalla riga in tabella
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Descrizione *</label>
            <input
              type="text"
              required
              autoFocus
              className={inputCls}
              placeholder="Es. VITE TRUC.TPS PZD ZN 3,5X35"
              value={descrizione}
              onChange={e => setDescrizione(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Codice OS1 *</label>
              <input
                type="text"
                required
                className={inputCls}
                placeholder="Es. 407230"
                value={codiceOs1}
                onChange={e => setCodiceOs1(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Unità di misura</label>
              <input
                type="text"
                className={inputCls}
                placeholder="NR"
                value={unitaMisura}
                onChange={e => setUnitaMisura(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Fornitore</label>
            <select className={inputCls} value={fornitoreId} onChange={e => setFornitoreId(e.target.value)}>
              <option value="">— nessuno —</option>
              {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>
              Codice Fornitore <span className="font-normal">(opzionale — il codice usato dal fornitore, es. nei tracciati ordine)</span>
            </label>
            <input
              type="text"
              className={inputCls}
              placeholder="Es. 653700400"
              value={codiceFornitore}
              onChange={e => setCodiceFornitore(e.target.value)}
            />
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
              {saving ? "Creazione…" : "Crea articolo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
