"use client";

import { useState, useMemo } from "react";
import type { Ritiro, RitiroUpdate, Scheda } from "@/lib/types";

const STATI = ["Da Fare", "In corso", "Fatto"];
const TIPI  = ["Ritiro", "Consegna"];

interface Props {
  ritiro: Ritiro;
  schede?: Scheda[];
  fornitori?: { id: string; nome: string }[];
  onClose: () => void;
  onSave: (updated: Ritiro) => void;
}

export default function FormModificaRitiro({ ritiro, schede = [], fornitori = [], onClose, onSave }: Props) {
  const [form, setForm] = useState<RitiroUpdate & { schedaId: string | null; fornitoreId: string | null }>({
    causale:         ritiro.causale,
    descrizioneMerce: ritiro.descrizioneMerce,
    dataTrasporto:   ritiro.dataTrasporto ?? "",
    tipoMovimento:   ritiro.tipoMovimento,
    stato:           ritiro.stato,
    urgenza:         ritiro.urgenza,
    nc:              ritiro.nc,
    schedaId:        ritiro.numeroOrdineId,
    fornitoreId:     fornitori.find(f => f.nome === ritiro.fornitore)?.id ?? null,
  });
  const [schedaSearch, setSchedaSearch] = useState(() => {
    if (!ritiro.numeroOrdineId) return "";
    const s = schede.find(s => s.id === ritiro.numeroOrdineId);
    return s ? `${s.odp} — ${s.numeroScheda}` : "";
  });
  const [schedaOpen, setSchedaOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  const schedeSuggerite = useMemo(() => {
    const q = schedaSearch.toLowerCase().trim();
    if (!q) return schede.slice(0, 8);
    return schede
      .filter(s => `${s.odp} ${s.numeroScheda} ${s.clienteInfo} ${s.descrizioneFasi}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [schede, schedaSearch]);

  function selectScheda(s: Scheda) {
    set("schedaId", s.id);
    setSchedaSearch(`${s.odp} — ${s.numeroScheda}`);
    setSchedaOpen(false);
  }

  function clearScheda() {
    set("schedaId", null);
    setSchedaSearch("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload: RitiroUpdate = {
        ...form,
        dataTrasporto: form.dataTrasporto || null,
        schedaId: form.schedaId,
        fornitoreId: form.fornitoreId,
      };
      const res = await fetch(`/api/ritiri/${ritiro.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      onSave(data as Ritiro);
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
        className="w-full max-w-lg bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]"
        style={{ borderRadius: "var(--radius-modal)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-base">Modifica Ritiro / Consegna</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
              {ritiro.descrizioneMerce || ritiro.id}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Scheda collegata */}
          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>
              Scheda ODP <span className="font-normal">(relation principale)</span>
            </label>
            {form.schedaId ? (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded border text-sm font-medium"
                style={{ borderColor: "var(--color-primary)", background: "rgba(240,143,37,0.05)" }}
              >
                <span className="flex-1">{schedaSearch}</span>
                <button type="button" onClick={clearScheda} className="text-gray-400 hover:text-gray-600 text-base leading-none">×</button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Cerca ODP, numero scheda, cliente…"
                  value={schedaSearch}
                  onChange={e => { setSchedaSearch(e.target.value); setSchedaOpen(true); }}
                  onFocus={() => setSchedaOpen(true)}
                  onBlur={() => setTimeout(() => setSchedaOpen(false), 150)}
                />
                {schedaOpen && schedeSuggerite.length > 0 && (
                  <ul
                    className="absolute z-50 w-full mt-1 rounded border bg-white shadow-lg overflow-y-auto"
                    style={{ borderColor: "#d1d5db", maxHeight: 220 }}
                  >
                    {schedeSuggerite.map(s => (
                      <li
                        key={s.id}
                        className="px-3 py-2 text-sm cursor-pointer hover:bg-orange-50"
                        onMouseDown={e => { e.preventDefault(); selectScheda(s); }}
                      >
                        <span className="font-semibold">{s.odp}</span>
                        {s.numeroScheda && <span className="ml-2 text-xs" style={{ color: "var(--color-grey-mid)" }}>{s.numeroScheda}</span>}
                        {s.clienteInfo && <span className="ml-2 text-xs truncate" style={{ color: "var(--color-grey-mid)" }}>{s.clienteInfo}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Stato</label>
              <select className={inputCls} value={form.stato} onChange={e => set("stato", e.target.value)}>
                <option value="">— nessuno —</option>
                {STATI.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Tipo Movimento</label>
              <select className={inputCls} value={form.tipoMovimento} onChange={e => set("tipoMovimento", e.target.value)}>
                <option value="">— nessuno —</option>
                {TIPI.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Descrizione</label>
              <input type="text" className={inputCls} value={form.causale} onChange={e => set("causale", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Trasporto</label>
              <input type="date" className={inputCls} value={form.dataTrasporto ?? ""} onChange={e => set("dataTrasporto", e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Fornitore</label>
              <select className={inputCls} value={form.fornitoreId ?? ""} onChange={e => set("fornitoreId", e.target.value || null)}>
                <option value="">— nessuno —</option>
                {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3 pt-5">
              <input
                id="urgenza"
                type="checkbox"
                checked={form.urgenza}
                onChange={e => set("urgenza", e.target.checked)}
                className="w-4 h-4 accent-orange-500"
              />
              <label htmlFor="urgenza" className="text-sm font-medium">Urgente</label>
            </div>
            <div className="flex items-center gap-3 pt-5">
              <input
                id="nc"
                type="checkbox"
                checked={form.nc ?? false}
                onChange={e => set("nc", e.target.checked)}
                className="w-4 h-4 accent-red-600"
              />
              <label htmlFor="nc" className="text-sm font-medium">NC (Non Conformità)</label>
            </div>
          </div>

          {error && (
            <div className="rounded-md border px-3 py-2" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
              <p className="text-sm font-semibold" style={{ color: "#991B1B" }}>Errore salvataggio</p>
              <p className="text-xs mt-0.5 font-mono break-all" style={{ color: "#B91C1C" }}>{error}</p>
            </div>
          )}

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
