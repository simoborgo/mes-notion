"use client";

import { useState } from "react";
import type { Laboratorio } from "@/lib/types";

const inputCls = "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300";
const labelCls = "block text-xs font-medium mb-1";

export default function LaboratorioFormModal({
  laboratorio,
  onClose,
  onSalvato,
}: {
  laboratorio: Laboratorio | null;
  onClose: () => void;
  onSalvato: (l: Laboratorio) => void;
}) {
  const isEdit = !!laboratorio;
  const [nome, setNome] = useState(laboratorio?.nome ?? "");
  const [note, setNote] = useState(laboratorio?.note ?? "");
  const [attivo, setAttivo] = useState(laboratorio?.attivo ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { setError("Nome obbligatorio."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(isEdit ? `/api/verniciatura/laboratori/${laboratorio!.id}` : "/api/verniciatura/laboratori", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), note: note.trim() || null, ...(isEdit ? { attivo } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      onSalvato(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]" style={{ borderRadius: "var(--radius-modal)" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-start justify-between" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(219,39,119,0.06))" }}>
          <div>
            <h2 className="font-semibold text-base">{isEdit ? "Modifica fornitore/laboratorio" : "Nuovo fornitore/laboratorio"}</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>Usato sia come fornitore vernice sia come laboratorio tintometrico.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Nome *</label>
            <input type="text" required autoFocus className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Note</label>
            <textarea className={inputCls} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={attivo} onChange={(e) => setAttivo(e.target.checked)} className="w-4 h-4 accent-orange-500" />
              Attivo
            </label>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded border font-medium hover:bg-gray-50 transition-colors">Annulla</button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm rounded font-medium text-white transition-colors disabled:opacity-60"
              style={{ background: saving ? "var(--color-grey-mid)" : "linear-gradient(135deg, #7C3AED, #DB2777)", borderRadius: "var(--radius-button)" }}
            >
              {saving ? "Salvataggio…" : isEdit ? "Salva modifiche" : "Crea"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
