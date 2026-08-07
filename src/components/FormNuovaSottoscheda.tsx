"use client";

import { useState } from "react";
import type { Scheda } from "@/lib/types";

interface Props {
  schedaPadre: Scheda;
  onClose: () => void;
  onCreated: (sottoscheda: Scheda) => void;
}

export default function FormNuovaSottoscheda({ schedaPadre, onClose, onCreated }: Props) {
  const [numeroScheda, setNumeroScheda] = useState("");
  const [codiceArticolo, setCodiceArticolo] = useState("");
  const [posizione, setPosizione] = useState("");
  const [quantita, setQuantita] = useState<string>("");
  const [dataProduzionePrevista, setDataProduzionePrevista] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!numeroScheda.trim()) {
      setError("Numero Scheda obbligatorio");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/schede/${schedaPadre.id}/sottoscheda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numeroScheda: numeroScheda.trim(),
          codiceArticolo: codiceArticolo || null,
          posizione: posizione || null,
          quantita: quantita === "" ? null : Number(quantita),
          dataProduzionePrevista: dataProduzionePrevista || null,
          note: note || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore creazione sottoscheda");
      onCreated(data as Scheda);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore creazione sottoscheda");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300";
  const labelCls = "block text-xs font-medium mb-1";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]"
        style={{ borderRadius: "var(--radius-modal)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-base">Nuova Sottoscheda</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
              {schedaPadre.odp} — {schedaPadre.numeroScheda}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Numero Scheda *</label>
            <input type="text" required className={inputCls} value={numeroScheda} onChange={(e) => setNumeroScheda(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Codice Articolo</label>
              <input type="text" className={inputCls} value={codiceArticolo} onChange={(e) => setCodiceArticolo(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Posizione</label>
              <input type="text" className={inputCls} value={posizione} onChange={(e) => setPosizione(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Quantità</label>
              <input type="number" min="0" className={inputCls} value={quantita} onChange={(e) => setQuantita(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Produzione Prevista</label>
              <input type="date" className={inputCls} value={dataProduzionePrevista} onChange={(e) => setDataProduzionePrevista(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Note</label>
            <textarea rows={3} className={inputCls + " resize-none"} value={note} onChange={(e) => setNote(e.target.value)} />
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
              {saving ? "Creazione…" : "Crea Sottoscheda"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
