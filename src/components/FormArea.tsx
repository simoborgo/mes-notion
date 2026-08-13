"use client";

import { useState } from "react";
import type { Area } from "@/lib/types";

const inputCls = "w-full border rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-orange-300";
const labelCls = "block text-sm font-medium mb-1";

export default function FormArea({
  commessaId, area, onClose, onSaved,
}: {
  commessaId: string;
  area?: Area;
  onClose: () => void;
  onSaved: (a: Area) => void;
}) {
  const [nomeArredo, setNomeArredo] = useState(area?.nomeArredo ?? "");
  const [posizione, setPosizione] = useState(area?.posizione ?? "");
  const [codiceArticoloA, setCodiceArticoloA] = useState(area?.codiceArticoloA ?? "");
  const [quantita, setQuantita] = useState(area?.quantita != null ? String(area.quantita) : "");
  const [dataConsegnaPrevista, setDataConsegnaPrevista] = useState(area?.dataConsegnaPrevista ?? "");
  const [statoProduzione, setStatoProduzione] = useState(area?.statoProduzione ?? "");
  const [note, setNote] = useState(area?.note ?? "");
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState("");

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeArredo.trim()) { setErrore("Nome Arredo obbligatorio"); return; }
    setSalvando(true);
    setErrore("");
    try {
      const payload = {
        commessaId,
        nomeArredo: nomeArredo.trim(),
        posizione: posizione.trim(),
        codiceArticoloA: codiceArticoloA.trim(),
        quantita: quantita.trim() ? Number(quantita) : null,
        dataConsegnaPrevista: dataConsegnaPrevista || null,
        statoProduzione: statoProduzione.trim(),
        note: note.trim(),
      };
      const res = await fetch(area ? `/api/aree/${area.id}` : "/api/aree", {
        method: area ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      onSaved(data as Area);
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
          <h2 className="font-semibold text-base">{area ? "Modifica area" : "Nuova area"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={salva} className="px-6 py-5 space-y-4">
          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Nome Arredo *</label>
            <input type="text" required className={inputCls} value={nomeArredo} onChange={e => setNomeArredo(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Posizione</label>
              <input type="text" className={inputCls} value={posizione} onChange={e => setPosizione(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Codice Articolo</label>
              <input type="text" className={inputCls} value={codiceArticoloA} onChange={e => setCodiceArticoloA(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Quantità</label>
              <input type="number" step="1" className={inputCls} value={quantita} onChange={e => setQuantita(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Consegna prevista</label>
              <input type="date" className={inputCls} value={dataConsegnaPrevista} onChange={e => setDataConsegnaPrevista(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Stato Produzione</label>
            <input type="text" className={inputCls} value={statoProduzione} onChange={e => setStatoProduzione(e.target.value)} />
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Note</label>
            <textarea className={inputCls} rows={2} value={note} onChange={e => setNote(e.target.value)} />
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
              {salvando ? "Salvataggio…" : area ? "Salva" : "Crea area"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
