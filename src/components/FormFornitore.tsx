"use client";

import { useState } from "react";
import type { Fornitore } from "@/lib/types";

const inputCls = "w-full border rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-orange-300";
const labelCls = "block text-sm font-medium mb-1";

export default function FormFornitore({
  fornitore, onClose, onSaved,
}: {
  fornitore?: Fornitore;
  onClose: () => void;
  onSaved: (f: Fornitore) => void;
}) {
  const [nome, setNome] = useState(fornitore?.nome ?? "");
  const [codiceOs1, setCodiceOs1] = useState(fornitore?.codiceOs1 ?? "");
  const [email, setEmail] = useState(fornitore?.email ?? "");
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState("");

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { setErrore("Nome obbligatorio"); return; }
    setSalvando(true);
    setErrore("");
    try {
      const payload = { nome: nome.trim(), codiceOs1: codiceOs1.trim(), email: email.trim() };
      const res = await fetch(fornitore ? `/api/admin/fornitori/${fornitore.id}` : "/api/admin/fornitori", {
        method: fornitore ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      onSaved(data as Fornitore);
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
          <h2 className="font-semibold text-base">{fornitore ? "Modifica fornitore" : "Nuovo fornitore"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={salva} className="px-6 py-5 space-y-4">
          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Nome *</label>
            <input type="text" required className={inputCls} value={nome} onChange={e => setNome(e.target.value)} />
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Codice OS1</label>
            <input type="text" className={inputCls} value={codiceOs1} onChange={e => setCodiceOs1(e.target.value)} />
            <p className="text-xs mt-1" style={{ color: "var(--color-grey-mid)" }}>
              Chiave usata per l&apos;abbinamento automatico durante gli import da OS1 (es. anagrafica Ferramenta).
            </p>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Email</label>
            <input type="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} />
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
              {salvando ? "Salvataggio…" : fornitore ? "Salva" : "Crea fornitore"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
