"use client";

import { useEffect, useState } from "react";
import type { Campionatura, Ciclo } from "@/lib/types";
import ClienteVerniciaturaAutocomplete from "./ClienteVerniciaturaAutocomplete";

const inputCls = "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300";
const labelCls = "block text-xs font-medium mb-1";

export default function CampionaturaFormModal({ onClose, onCreata }: { onClose: () => void; onCreata: (c: Campionatura) => void }) {
  const [cicli, setCicli] = useState<Ciclo[]>([]);
  const [clienti, setClienti] = useState<string[]>([]);
  const [cicloId, setCicloId] = useState("");
  const [cliente, setCliente] = useState("");
  const [codiceCampioneMaterialista, setCodiceCampioneMaterialista] = useState("");
  const [dataCampionatura, setDataCampionatura] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [forzaNuovoBarcode, setForzaNuovoBarcode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/verniciatura/cicli").then((r) => r.json()).then((c) => Array.isArray(c) && setCicli(c)).catch(() => {});
    fetch("/api/verniciatura/campionature/clienti").then((r) => r.json()).then((c) => Array.isArray(c) && setClienti(c)).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cicloId) { setError("Seleziona una scheda di verniciatura."); return; }
    if (!cliente) { setError("Seleziona un cliente."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/verniciatura/campionature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cicloId,
          cliente,
          codiceCampioneMaterialista: codiceCampioneMaterialista.trim() || null,
          dataCampionatura,
          note: note.trim() || null,
          forzaNuovoBarcode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      onCreata(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la creazione.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]" style={{ borderRadius: "var(--radius-modal)" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-start justify-between" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(219,39,119,0.06))" }}>
          <div>
            <h2 className="font-semibold text-base">Nuova campionatura</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>Il barcode viene generato (o riusato se già esiste per stesso cliente/vernici) automaticamente.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Scheda di verniciatura *</label>
            <select required className={inputCls} value={cicloId} onChange={(e) => setCicloId(e.target.value)}>
              <option value="">—</option>
              {cicli.map((c) => <option key={c.id} value={c.id}>{c.nome || `Scheda ${c.id.slice(0, 8)}`} ({c.stato})</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Cliente *</label>
            <ClienteVerniciaturaAutocomplete clienti={clienti} value={cliente} onChange={setCliente} />
          </div>
          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Codice Material List</label>
            <input type="text" className={inputCls} value={codiceCampioneMaterialista} onChange={(e) => setCodiceCampioneMaterialista(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data campionatura</label>
            <input type="date" className={inputCls} value={dataCampionatura} onChange={(e) => setDataCampionatura(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Note</label>
            <textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={forzaNuovoBarcode} onChange={(e) => setForzaNuovoBarcode(e.target.checked)} className="w-4 h-4 accent-orange-500" />
            Forza un nuovo barcode (non riusare uno esistente)
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded border font-medium hover:bg-gray-50 transition-colors">Annulla</button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm rounded font-medium text-white transition-colors disabled:opacity-60"
              style={{ background: saving ? "var(--color-grey-mid)" : "linear-gradient(135deg, #7C3AED, #DB2777)", borderRadius: "var(--radius-button)" }}
            >
              {saving ? "Creazione…" : "Crea campionatura"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
