"use client";

import { useState, useMemo, useRef } from "react";
import type { Ritiro, Scheda, Commessa } from "@/lib/types";

const TIPI = ["Ritiro", "Consegna"];

function nowDate(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

// date="YYYY-MM-DD", ora="HH:mm" (vuota = nessun orario)
function buildNotionDate(date: string, ora: string): string | null {
  if (!date) return null;
  if (!ora) return date; // data senza orario → stringa ISO date-only
  return new Date(`${date}T${ora}`).toISOString();
}

interface Props {
  schede?: Scheda[];
  fornitori?: { id: string; nome: string }[];
  commesse?: Commessa[];
  onClose: () => void;
  onCreated: (ritiro: Ritiro) => void;
}

export default function FormNuovoRitiro({ schede = [], fornitori = [], commesse = [], onClose, onCreated }: Props) {
  const [mode, setMode] = useState<"odp" | "commessa">("odp");
  const [form, setForm] = useState({
    causale: "",
    tipoMovimento: "",
    dataData: nowDate(),
    dataOra: "",
    urgenza: false,
    nc: false,
    nrCollo: null as number | null,
    totColli: null as number | null,
    schedaId: null as string | null,
    fornitoreId: null as string | null,
    commessaId: null as string | null,
  });
  const [schedaSearch, setSchedaSearch] = useState("");
  const [schedaOpen, setSchedaOpen] = useState(false);
  const [commessaSearch, setCommessaSearch] = useState("");
  const [commessaOpen, setCommessaOpen] = useState(false);
  const [tipoSuggerito, setTipoSuggerito] = useState<string | null>(null);
  const [foto, setFoto] = useState<string[]>([]);
  const [fotoPreviews, setFotoPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    files.forEach(file => {
      const preview = URL.createObjectURL(file);
      const reader = new FileReader();
      reader.onload = () => {
        setFoto(prev => [...prev, reader.result as string]);
        setFotoPreviews(prev => [...prev, preview]);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeFoto(i: number) {
    URL.revokeObjectURL(fotoPreviews[i]);
    setFoto(prev => prev.filter((_, j) => j !== i));
    setFotoPreviews(prev => prev.filter((_, j) => j !== i));
  }

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function switchMode(m: "odp" | "commessa") {
    setMode(m);
    // Reset campi mutuamente esclusivi
    setForm(prev => ({ ...prev, schedaId: null, commessaId: null }));
    setSchedaSearch("");
    setCommessaSearch("");
    setTipoSuggerito(null);
  }

  const schedeSuggerite = useMemo(() => {
    const q = schedaSearch.toLowerCase().trim();
    if (!q) return schede.slice(0, 30);
    return schede.filter(s =>
      `${s.odp} ${s.numeroScheda} ${s.clienteInfo} ${s.descrizioneFasi}`.toLowerCase().includes(q)
    );
  }, [schede, schedaSearch]);

  const commesseSuggerite = useMemo(() => {
    const q = commessaSearch.toLowerCase().trim();
    if (!q) return commesse.slice(0, 30);
    return commesse.filter(c =>
      `${c.numeroCommessa} ${c.cliente} ${c.localita}`.toLowerCase().includes(q)
    );
  }, [commesse, commessaSearch]);

  function selectScheda(s: Scheda) {
    const fornitoreMatch = fornitori.find(f => f.nome === s.fornitore);
    const tipo = s.statoProdEsterna === "In Lavorazione" ? "Ritiro" : "Consegna";
    const nomeForn = s.fornitore || fornitoreMatch?.nome;
    const causaleAuto = nomeForn ? `${tipo} da ${nomeForn}` : tipo;
    setTipoSuggerito(tipo);
    setForm(prev => ({
      ...prev,
      schedaId: s.id,
      commessaId: s.commessaId ?? null, // auto-fill commessa dall'ODP
      fornitoreId: fornitoreMatch?.id ?? prev.fornitoreId,
      tipoMovimento: prev.tipoMovimento || tipo,
      causale: prev.causale || causaleAuto,
    }));
    setSchedaSearch(s.parentId ? `↳ ${s.odp} — ${s.numeroScheda}` : `${s.odp} — ${s.numeroScheda}`);
    setSchedaOpen(false);
  }

  function clearScheda() {
    setForm(prev => ({ ...prev, schedaId: null, commessaId: null }));
    setSchedaSearch("");
    setTipoSuggerito(null);
  }

  function selectCommessa(c: Commessa) {
    setForm(prev => ({ ...prev, commessaId: c.id }));
    setCommessaSearch(`${c.numeroCommessa}${c.cliente ? " — " + c.cliente : ""}`);
    setCommessaOpen(false);
  }

  function clearCommessa() {
    setForm(prev => ({ ...prev, commessaId: null }));
    setCommessaSearch("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.causale.trim()) { setError("La descrizione è obbligatoria."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/ritiri", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          causale: form.causale.trim(),
          tipoMovimento: form.tipoMovimento || undefined,
          dataTrasporto: buildNotionDate(form.dataData, form.dataOra),
          urgenza: form.urgenza,
          nc: form.nc,
          nrCollo: form.nrCollo,
          totColli: form.totColli,
          schedaId: form.schedaId,
          fornitoreId: form.fornitoreId,
          commessaId: form.commessaId,
          foto_base64: foto.length ? foto : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Errore creazione");
      }
      const ritiro: Ritiro = await res.json();
      onCreated(ritiro);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio. Riprova.");
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
            <h2 className="font-semibold text-base">Nuovo Movimento</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
              Stato iniziale: Da Fare
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Toggle ODP vs Commessa */}
          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Collega a</label>
            <div className="flex rounded border overflow-hidden" style={{ borderColor: "#E5E7EB" }}>
              <button
                type="button"
                onClick={() => switchMode("odp")}
                className="flex-1 py-2 text-sm font-semibold transition-colors"
                style={{
                  background: mode === "odp" ? "var(--color-primary)" : "white",
                  color: mode === "odp" ? "white" : "var(--color-grey-mid)",
                }}
              >
                Scheda ODP
              </button>
              <button
                type="button"
                onClick={() => switchMode("commessa")}
                className="flex-1 py-2 text-sm font-semibold transition-colors border-l"
                style={{
                  background: mode === "commessa" ? "var(--color-primary)" : "white",
                  color: mode === "commessa" ? "white" : "var(--color-grey-mid)",
                  borderColor: "#E5E7EB",
                }}
              >
                Solo Commessa
              </button>
            </div>
          </div>

          {/* Scheda ODP (mode = "odp") */}
          {mode === "odp" && (
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>
                Scheda ODP <span className="font-normal">(opzionale)</span>
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
                          style={{ paddingLeft: s.parentId ? "1.5rem" : undefined }}
                          onMouseDown={e => { e.preventDefault(); selectScheda(s); }}
                        >
                          {s.parentId && <span className="text-gray-400 mr-1 text-xs">↳</span>}
                          <span className={s.parentId ? "font-normal" : "font-semibold"}>{s.odp}</span>
                          {s.numeroScheda && <span className="ml-2 text-xs" style={{ color: "var(--color-grey-mid)" }}>{s.numeroScheda}</span>}
                          {s.clienteInfo && <span className="ml-2 text-xs truncate" style={{ color: "var(--color-grey-mid)" }}>{s.clienteInfo}</span>}
                          {s.parentId && s.tipologia && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: "#F3F4F6", color: "#6B7280" }}>
                              {s.tipologia}
                            </span>
                          )}
                          {s.statoProdEsterna && (
                            <span
                              className="ml-2 text-xs px-1.5 py-0.5 rounded font-medium"
                              style={{
                                background: s.statoProdEsterna === "In Lavorazione" ? "#FEF3C7" : "#D1FAE5",
                                color:      s.statoProdEsterna === "In Lavorazione" ? "#92400E" : "#065F46",
                              }}
                            >
                              {s.statoProdEsterna}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Commessa diretta (mode = "commessa") */}
          {mode === "commessa" && (
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Commessa</label>
              {form.commessaId ? (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded border text-sm font-medium"
                  style={{ borderColor: "var(--color-primary)", background: "rgba(240,143,37,0.05)" }}
                >
                  <span className="flex-1">{commessaSearch}</span>
                  <button type="button" onClick={clearCommessa} className="text-gray-400 hover:text-gray-600 text-base leading-none">×</button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="Cerca numero commessa, cliente…"
                    value={commessaSearch}
                    onChange={e => { setCommessaSearch(e.target.value); setCommessaOpen(true); }}
                    onFocus={() => setCommessaOpen(true)}
                    onBlur={() => setTimeout(() => setCommessaOpen(false), 150)}
                  />
                  {commessaOpen && commesseSuggerite.length > 0 && (
                    <ul
                      className="absolute z-50 w-full mt-1 rounded border bg-white shadow-lg overflow-y-auto"
                      style={{ borderColor: "#d1d5db", maxHeight: 220 }}
                    >
                      {commesseSuggerite.map(c => (
                        <li
                          key={c.id}
                          className="px-3 py-2 text-sm cursor-pointer hover:bg-orange-50"
                          onMouseDown={e => { e.preventDefault(); selectCommessa(c); }}
                        >
                          <span className="font-semibold">{c.numeroCommessa}</span>
                          {c.cliente && <span className="ml-2 text-xs" style={{ color: "var(--color-grey-mid)" }}>{c.cliente}</span>}
                          {c.localita && <span className="ml-2 text-xs" style={{ color: "var(--color-grey-mid)" }}>{c.localita}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Descrizione *</label>
            <input
              type="text"
              required
              className={inputCls}
              placeholder="Es. Ritiro materiale lavorato"
              value={form.causale}
              onChange={e => set("causale", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Tipo Movimento</label>
              <select className={inputCls} value={form.tipoMovimento} onChange={e => { set("tipoMovimento", e.target.value); setTipoSuggerito(null); }}>
                <option value="">— nessuno —</option>
                {TIPI.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {tipoSuggerito && form.tipoMovimento === tipoSuggerito && (
                <p className="text-xs mt-1" style={{ color: "var(--color-grey-mid)" }}>
                  Suggerito dalla scheda ODP
                </p>
              )}
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Trasporto</label>
              <div className="flex gap-2 items-center">
                <input type="date" className={inputCls} style={{ flex: 1 }} value={form.dataData} onChange={e => set("dataData", e.target.value)} />
                <input type="time" className={inputCls} style={{ flex: "0 0 110px" }} value={form.dataOra} onChange={e => set("dataOra", e.target.value)} placeholder="Orario" />
                {form.dataOra && (
                  <button type="button" onClick={() => set("dataOra", "")} className="text-xs px-2 py-1.5 rounded border hover:bg-gray-50" style={{ color: "#6B7280", borderColor: "#E5E7EB", whiteSpace: "nowrap" }} title="Rimuovi orario">
                    ✕ ora
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Fornitore</label>
              <select className={inputCls} value={form.fornitoreId ?? ""} onChange={e => set("fornitoreId", e.target.value || null)}>
                <option value="">— nessuno —</option>
                {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <input
                id="urgenza-new"
                type="checkbox"
                checked={form.urgenza}
                onChange={e => set("urgenza", e.target.checked)}
                className="w-4 h-4 accent-orange-500"
              />
              <label htmlFor="urgenza-new" className="text-sm font-medium">Urgente</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="nc-new"
                type="checkbox"
                checked={form.nc}
                onChange={e => set("nc", e.target.checked)}
                className="w-4 h-4 accent-red-600"
              />
              <label htmlFor="nc-new" className="text-sm font-medium">NC (Non Conformità)</label>
            </div>
          </div>

          {/* Colli */}
          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>
              Colli <span className="font-normal">(opzionale)</span>
            </label>
            <div className="flex items-center gap-2">
              <div style={{ flex: "0 0 90px" }}>
                <input
                  type="number"
                  min={1}
                  className={inputCls}
                  placeholder="Collo N°"
                  value={form.nrCollo ?? ""}
                  onChange={e => set("nrCollo", e.target.value ? Number(e.target.value) : null)}
                />
              </div>
              <span className="text-sm font-medium" style={{ color: "var(--color-grey-mid)" }}>di</span>
              <div style={{ flex: "0 0 90px" }}>
                <input
                  type="number"
                  min={1}
                  className={inputCls}
                  placeholder="Tot."
                  value={form.totColli ?? ""}
                  onChange={e => set("totColli", e.target.value ? Number(e.target.value) : null)}
                />
              </div>
              <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>es. "1 di 3"</span>
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>
              Foto <span className="font-normal">(opzionale)</span>
            </label>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleFoto} />
            {fotoPreviews.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {fotoPreviews.map((src, i) => (
                  <div key={i} className="relative rounded border overflow-hidden" style={{ width: 64, height: 64, borderColor: "#e5e4e0" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFoto(i)}
                      className="absolute top-0.5 right-0.5 flex items-center justify-center rounded-full"
                      style={{ width: 18, height: 18, background: "rgba(0,0,0,0.55)", color: "white", fontSize: "0.65rem" }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded border border-dashed transition-colors hover:bg-gray-50"
              style={{ borderColor: "#d1d5db", color: "var(--color-grey-mid)" }}
            >
              <span>📷</span> {fotoPreviews.length > 0 ? `${fotoPreviews.length} foto — aggiungi altra` : "Scatta o allega foto"}
            </button>
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
              {saving ? "Creazione…" : "Crea Movimento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
