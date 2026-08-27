"use client";

import { useState } from "react";
import type { Legno, UnitaMisuraLegno } from "@/lib/types";

const inputCls = "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300";
const inputDisabledCls = "w-full border rounded px-3 py-2 text-sm bg-gray-100 text-gray-500 cursor-not-allowed";
const labelCls = "block text-xs font-medium mb-1";

interface Props {
  legno: Legno | null;
  onClose: () => void;
  onSalvato: (l: Legno) => void;
}

export default function LegnoFormModal({ legno, onClose, onSalvato }: Props) {
  const isEdit = !!legno;
  const [codice, setCodice] = useState(legno?.codice ?? "");
  const [essenza, setEssenza] = useState(legno?.essenza ?? "");
  const [qualita, setQualita] = useState(legno?.qualita ?? "");
  const [spessoreMm, setSpessoreMm] = useState(legno?.spessoreMm != null ? String(legno.spessoreMm) : "");
  const [larghezzaMm, setLarghezzaMm] = useState(legno?.larghezzaMm != null ? String(legno.larghezzaMm) : "");
  const [lunghezzaMm, setLunghezzaMm] = useState(legno?.lunghezzaMm != null ? String(legno.lunghezzaMm) : "");
  const [fornitore, setFornitore] = useState(legno?.fornitore ?? "");
  const [codiceFornitore, setCodiceFornitore] = useState(legno?.codiceFornitore ?? "");
  const [codiceInventario, setCodiceInventario] = useState(legno?.codiceInventario ?? "");
  const [unitaMisura, setUnitaMisura] = useState<UnitaMisuraLegno | "">(legno?.unitaMisura ?? "");
  const [clienteRiferimento, setClienteRiferimento] = useState(legno?.clienteRiferimento ?? "");
  const [attivo, setAttivo] = useState(legno?.attivo ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        codice: codice.trim() || null,
        essenza: essenza.trim() || null,
        qualita: qualita.trim() || null,
        spessoreMm: spessoreMm.trim() ? Number(spessoreMm) : null,
        larghezzaMm: larghezzaMm.trim() ? Number(larghezzaMm) : null,
        lunghezzaMm: lunghezzaMm.trim() ? Number(lunghezzaMm) : null,
        fornitore: fornitore.trim() || null,
        codiceFornitore: codiceFornitore.trim() || null,
        ...(isEdit ? {} : { codiceInventario: codiceInventario.trim() || null }),
        unitaMisura: unitaMisura || null,
        clienteRiferimento: clienteRiferimento.trim() || null,
        ...(isEdit ? { attivo } : {}),
      };
      const res = await fetch(isEdit ? `/api/magazzino/legno/${legno!.id}` : "/api/magazzino/legno", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]" style={{ borderRadius: "var(--radius-modal)" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-start justify-between" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(219,39,119,0.06))" }}>
          <div>
            <h2 className="font-semibold text-base">{isEdit ? "Modifica legno" : "Nuovo legno"}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Essenza</label>
              <input type="text" className={inputCls} value={essenza} onChange={(e) => setEssenza(e.target.value)} placeholder="Rovere, Faggio, Noce Canaletto…" />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Qualità/scelta</label>
              <input type="text" className={inputCls} value={qualita} onChange={(e) => setQualita(e.target.value)} placeholder="Prima scelta, Nodato…" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Spessore (mm)</label>
              <input type="number" min="0" step="0.1" className={inputCls} value={spessoreMm} onChange={(e) => setSpessoreMm(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Larghezza (mm)</label>
              <input type="number" min="0" step="0.1" className={inputCls} value={larghezzaMm} onChange={(e) => setLarghezzaMm(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Lunghezza (mm)</label>
              <input type="number" min="0" step="0.1" className={inputCls} value={lunghezzaMm} onChange={(e) => setLunghezzaMm(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Fornitore</label>
              <input type="text" className={inputCls} value={fornitore} onChange={(e) => setFornitore(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Codice fornitore</label>
              <input type="text" className={inputCls} value={codiceFornitore} onChange={(e) => setCodiceFornitore(e.target.value)} />
            </div>
          </div>
          <p className="text-xs -mt-2" style={{ color: "var(--color-grey-mid)" }}>
            Fornitore informativo: non ancora collegato a un registro condiviso.
          </p>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Codice interno</label>
              <input type="text" className={inputCls} value={codice} onChange={(e) => setCodice(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Unità di misura</label>
              <select className={inputCls} value={unitaMisura} onChange={(e) => setUnitaMisura(e.target.value as UnitaMisuraLegno | "")}>
                <option value="">—</option>
                <option value="M3">M3</option>
                <option value="MQ">MQ</option>
                <option value="ML">ML</option>
                <option value="NR">NR</option>
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Cod. inventario {isEdit && <span className="normal-case font-normal">(non modificabile)</span>}</label>
              <input
                type="text"
                className={isEdit ? inputDisabledCls : inputCls}
                value={codiceInventario}
                onChange={(e) => setCodiceInventario(e.target.value)}
                disabled={isEdit}
                readOnly={isEdit}
              />
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Cliente (riferimento)</label>
            <input type="text" className={inputCls} value={clienteRiferimento} onChange={(e) => setClienteRiferimento(e.target.value)} />
          </div>

          {isEdit && (
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Stato</label>
              <select
                className={inputCls}
                style={{ color: attivo ? "#166534" : "#991B1B", fontWeight: 600 }}
                value={attivo ? "attivo" : "obsoleto"}
                onChange={(e) => setAttivo(e.target.value === "attivo")}
              >
                <option value="attivo">Attivo (In Uso)</option>
                <option value="obsoleto">Obsoleto</option>
              </select>
            </div>
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
              {saving ? "Salvataggio…" : isEdit ? "Salva modifiche" : "Crea legno"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
