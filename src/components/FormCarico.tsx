"use client";

import { useMemo, useState } from "react";
import type { Carico, Commessa, Scheda } from "@/lib/types";

const MODALITA = ["Gomma", "Aerea", "Nave"];
const STATI = ["Pianificato", "Confermato", "Spedito"];

interface FormState {
  titolo: string;
  descrizione: string;
  dataCarico: string;
  commessaId: string | null;
  odpIds: string[];
  modalita: string;
  stato: string;
}

function OdpMultiSelect({ schede, value, onChange }: { schede: Scheda[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const schedeMap = useMemo(() => new Map(schede.map((s) => [s.id, s])), [schede]);
  const selected = value.map((id) => schedeMap.get(id)).filter(Boolean) as Scheda[];

  const filtrati = useMemo(() => {
    const q = search.toLowerCase().trim();
    const candidati = schede.filter((s) => s.odp && !value.includes(s.id));
    if (!q) return candidati.slice(0, 30);
    return candidati
      .filter((s) => `${s.odp} ${s.numeroScheda} ${s.clienteInfo}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [schede, search, value]);

  function add(id: string) {
    onChange([...value, id]);
    setSearch("");
  }
  function remove(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: "rgba(240,143,37,0.08)", color: "var(--color-primary)" }}
            >
              {s.odp}{s.numeroScheda ? ` — ${s.numeroScheda}` : ""}
              <button type="button" onClick={() => remove(s.id)} className="hover:opacity-70 leading-none">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          type="text"
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          placeholder="Cerca ODP da aggiungere…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && filtrati.length > 0 && (
          <ul
            className="absolute z-50 w-full mt-1 rounded-lg border bg-white shadow-lg overflow-y-auto"
            style={{ borderColor: "#d1d5db", maxHeight: 220 }}
          >
            {filtrati.map((s) => (
              <li
                key={s.id}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-orange-50"
                onMouseDown={(e) => { e.preventDefault(); add(s.id); }}
              >
                <span className="font-semibold">{s.odp}</span>
                {s.numeroScheda && <span className="ml-1.5">— {s.numeroScheda}</span>}
                {s.clienteInfo && <span className="ml-1.5 text-xs" style={{ color: "#9ca3af" }}>{s.clienteInfo}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface Props {
  carico?: Carico | null;
  commesse: Commessa[];
  schede: Scheda[];
  onClose: () => void;
  onSave: (carico: Carico) => void;
}

export default function FormCarico({ carico, commesse, schede, onClose, onSave }: Props) {
  const isEdit = !!carico;
  const [form, setForm] = useState<FormState>({
    titolo: carico?.titolo ?? "",
    descrizione: carico?.descrizione ?? "",
    dataCarico: carico?.dataCarico ?? "",
    commessaId: carico?.commessaId ?? null,
    odpIds: carico?.odpIds ?? [],
    modalita: carico?.modalita ?? "",
    stato: carico?.stato ?? "Pianificato",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titolo.trim()) { setError("Titolo obbligatorio"); return; }
    if (!form.dataCarico) { setError("Data Carico obbligatoria"); return; }
    setSaving(true);
    setError("");
    try {
      const payload = {
        titolo: form.titolo.trim(),
        descrizione: form.descrizione,
        dataCarico: form.dataCarico,
        commessaId: form.commessaId,
        odpIds: form.odpIds,
        modalita: form.modalita || undefined,
        stato: form.stato || undefined,
      };
      const url = isEdit ? `/api/carichi/${carico!.id}` : "/api/carichi";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      const saved: Carico = await res.json();
      onSave(saved);
    } catch {
      setError("Errore durante il salvataggio. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300";
  const labelCls = "block text-xs font-medium mb-1";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]"
        style={{ borderRadius: "var(--radius-modal)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-base">{isEdit ? "Modifica Carico" : "Nuovo Carico"}</h2>
            {isEdit && (
              <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
                {carico!.titolo}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Titolo</label>
              <input type="text" className={inputCls} value={form.titolo} onChange={(e) => set("titolo", e.target.value)} required />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Carico</label>
              <input type="date" className={inputCls} value={form.dataCarico} onChange={(e) => set("dataCarico", e.target.value)} required />
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Descrizione</label>
            <textarea rows={2} className={inputCls + " resize-none"} value={form.descrizione} onChange={(e) => set("descrizione", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Commessa</label>
              <select className={inputCls} value={form.commessaId ?? ""} onChange={(e) => set("commessaId", e.target.value || null)}>
                <option value="">— nessuna —</option>
                {commesse.map((c) => (
                  <option key={c.id} value={c.id}>{c.numeroCommessa} — {c.cliente}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Modalità</label>
              <select className={inputCls} value={form.modalita} onChange={(e) => set("modalita", e.target.value)}>
                <option value="">— nessuna —</option>
                {MODALITA.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Stato</label>
            <select className={inputCls} value={form.stato} onChange={(e) => set("stato", e.target.value)}>
              {STATI.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>ODP collegati</label>
            <OdpMultiSelect schede={schede} value={form.odpIds} onChange={(ids) => set("odpIds", ids)} />
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
              {saving ? "Salvataggio…" : "Salva"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
