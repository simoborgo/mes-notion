"use client";

import { useState } from "react";
import type { Commessa } from "@/lib/types";

const inputCls = "w-full border rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-orange-300";
const labelCls = "block text-sm font-medium mb-1";

const STATI = ["ShopDrawing", "In produzione", "In spedizione", "In montaggio", "Chiusa"];

export default function FormCommessa({
  commessa, onClose, onSaved,
}: {
  commessa?: Commessa;
  onClose: () => void;
  onSaved: (c: Commessa) => void;
}) {
  const [numeroCommessa, setNumeroCommessa] = useState(commessa?.numeroCommessa ?? "");
  const [cliente, setCliente] = useState(commessa?.cliente ?? "");
  const [localita, setLocalita] = useState(commessa?.localita ?? "");
  const [responsabile, setResponsabile] = useState(commessa?.responsabile ?? "");
  const [stato, setStato] = useState(commessa?.stato ?? "ShopDrawing");
  const [dataCarico, setDataCarico] = useState(commessa?.dataCarico ?? "");
  const [inizioMontaggio, setInizioMontaggio] = useState(commessa?.inizioMontaggio ?? "");
  const [fineMontaggio, setFineMontaggio] = useState(commessa?.fineMontaggio ?? "");
  const [info, setInfo] = useState(commessa?.info ?? "");
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState("");

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    if (!numeroCommessa.trim()) { setErrore("Numero Commessa obbligatorio"); return; }
    setSalvando(true);
    setErrore("");
    try {
      const payload = {
        numeroCommessa: numeroCommessa.trim(),
        cliente: cliente.trim(),
        localita: localita.trim(),
        responsabile: responsabile.trim(),
        stato,
        dataCarico: dataCarico || null,
        inizioMontaggio: inizioMontaggio || null,
        fineMontaggio: fineMontaggio || null,
        info: info.trim(),
      };
      const res = await fetch(commessa ? `/api/commesse/${commessa.id}` : "/api/commesse", {
        method: commessa ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      onSaved(data as Commessa);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]"
        style={{ borderRadius: "var(--radius-modal)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
          <h2 className="font-semibold text-base">{commessa ? "Modifica commessa" : "Nuova commessa"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={salva} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Numero Commessa *</label>
              <input type="text" required className={inputCls} value={numeroCommessa} onChange={e => setNumeroCommessa(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Stato</label>
              <select className={inputCls} value={stato} onChange={e => setStato(e.target.value)}>
                {STATI.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Cliente</label>
              <input type="text" className={inputCls} value={cliente} onChange={e => setCliente(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Località</label>
              <input type="text" className={inputCls} value={localita} onChange={e => setLocalita(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Responsabile</label>
            <input
              type="text" className={inputCls} value={responsabile} onChange={e => setResponsabile(e.target.value)}
              placeholder="Nomi separati da virgola, es. Luca, Simone"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Carico</label>
              <input type="date" className={inputCls} value={dataCarico} onChange={e => setDataCarico(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Inizio Montaggio</label>
              <input type="date" className={inputCls} value={inizioMontaggio} onChange={e => setInizioMontaggio(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Fine Montaggio</label>
              <input type="date" className={inputCls} value={fineMontaggio} onChange={e => setFineMontaggio(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Info</label>
            <textarea className={inputCls} rows={3} value={info} onChange={e => setInfo(e.target.value)} />
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
              {salvando ? "Salvataggio…" : commessa ? "Salva" : "Crea commessa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
