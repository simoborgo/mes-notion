"use client";

import { useState } from "react";
import type { Operatore } from "@/lib/types";

const inputCls = "w-full border rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-orange-300";
const labelCls = "block text-sm font-medium mb-1";

export default function FormOperatore({
  operatore, repartiSuggeriti, aziendeSuggerite, onClose, onSaved,
}: {
  operatore?: Operatore;
  repartiSuggeriti: string[];
  aziendeSuggerite: string[];
  onClose: () => void;
  onSaved: (o: Operatore) => void;
}) {
  const [cognome, setCognome] = useState(operatore?.cognome ?? "");
  const [nome, setNome] = useState(operatore?.nome ?? "");
  const [reparto, setReparto] = useState(operatore?.reparto ?? "");
  const [tipo, setTipo] = useState(operatore?.tipo ?? "Modar");
  const [azienda, setAzienda] = useState(operatore?.azienda ?? "");
  const [inForza, setInForza] = useState(operatore?.inForza ?? true);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState("");

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    if (!cognome.trim()) { setErrore("Cognome obbligatorio"); return; }
    setSalvando(true);
    setErrore("");
    try {
      const payload = { cognome: cognome.trim(), nome: nome.trim(), reparto: reparto.trim(), tipo, azienda: azienda.trim(), inForza };
      const res = await fetch(operatore ? `/api/admin/operatori/${operatore.id}` : "/api/admin/operatori", {
        method: operatore ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      onSaved(data as Operatore);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]"
        style={{ borderRadius: "var(--radius-modal)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
          <h2 className="font-semibold text-base">{operatore ? "Modifica operatore" : "Nuovo operatore"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={salva} className="px-6 py-5 space-y-4">
          {operatore && (
            <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Matricola: <span className="font-mono">{operatore.matricola}</span></p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Cognome *</label>
              <input type="text" required className={inputCls} value={cognome} onChange={e => setCognome(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Nome</label>
              <input type="text" className={inputCls} value={nome} onChange={e => setNome(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Reparto</label>
            <input type="text" className={inputCls} value={reparto} onChange={e => setReparto(e.target.value)} list="reparti-suggeriti" />
            <datalist id="reparti-suggeriti">
              {repartiSuggeriti.map(r => <option key={r} value={r} />)}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Tipo</label>
              <select className={inputCls} value={tipo} onChange={e => setTipo(e.target.value)}>
                <option value="Modar">Interno (Modar)</option>
                <option value="Esterno">Esterno</option>
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Azienda</label>
              <input type="text" className={inputCls} value={azienda} onChange={e => setAzienda(e.target.value)} list="aziende-suggerite" />
              <datalist id="aziende-suggerite">
                {aziendeSuggerite.map(a => <option key={a} value={a} />)}
              </datalist>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="operatore-in-forza" type="checkbox" checked={inForza}
              onChange={e => setInForza(e.target.checked)} className="w-4 h-4 accent-orange-500"
            />
            <label htmlFor="operatore-in-forza" className="text-base font-medium">In forza</label>
          </div>

          {errore && <p className="text-base text-red-600">{errore}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-base rounded border font-medium hover:bg-gray-50 transition-colors">
              Annulla
            </button>
            <button
              type="submit" disabled={salvando}
              className="px-4 py-2 text-base rounded font-medium text-white transition-colors disabled:opacity-60"
              style={{ background: salvando ? "var(--color-grey-mid)" : "var(--color-primary)", borderRadius: "var(--radius-button)" }}
            >
              {salvando ? "Salvataggio…" : operatore ? "Salva" : "Crea operatore"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
