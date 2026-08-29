"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Cassa, CassaSchedaRiga, Scheda } from "@/lib/types";

interface FormState {
  descrizione: string;
  note: string;
  schede: CassaSchedaRiga[];
}

// Multi-select Schede per una Cassa: a differenza di OdpMultiSelect (Carichi), qui una Scheda può
// comparire in più casse contemporaneamente (deciso con l'utente 2026-08-29 — un arredo smontato
// può finire in più casse), quindi non si escludono le Schede già assegnate altrove — si segnala
// solo con un badge "già in altra cassa" per chiarezza. Ogni riga selezionata ha una nota libera
// (es. "solo ante") per descrivere quale parte della Scheda sta in questa cassa.
//
// Dropdown con position:fixed (coordinate da getBoundingClientRect) invece di absolute — questo
// form vive in un modal con overflow-y-auto, con absolute la lista finiva tagliata/in secondo
// piano (stesso problema già risolto in VerniceSelect.tsx/SchedaVerniciaturaAutocomplete.tsx).
function CassaSchedeSelect({
  schedeDisponibili, schedeAltreCasse, value, onChange,
}: {
  schedeDisponibili: Scheda[];
  schedeAltreCasse: Set<string>;
  value: CassaSchedaRiga[];
  onChange: (righe: CassaSchedaRiga[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const schedeMap = useMemo(() => new Map(schedeDisponibili.map((s) => [s.id, s])), [schedeDisponibili]);
  const selectedIds = new Set(value.map((r) => r.schedaId));

  const filtrati = useMemo(() => {
    const q = search.toLowerCase().trim();
    const candidati = schedeDisponibili.filter((s) => !selectedIds.has(s.id));
    if (!q) return candidati.slice(0, 30);
    return candidati
      .filter((s) => `${s.odp} ${s.numeroScheda} ${s.clienteInfo}`.toLowerCase().includes(q))
      .slice(0, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedeDisponibili, search, value]);

  function apri() {
    const rect = inputRef.current?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function riposiziona() {
      const rect = inputRef.current?.getBoundingClientRect();
      if (rect) setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    window.addEventListener("scroll", riposiziona, true);
    window.addEventListener("resize", riposiziona);
    return () => {
      window.removeEventListener("scroll", riposiziona, true);
      window.removeEventListener("resize", riposiziona);
    };
  }, [open]);

  function add(id: string) {
    onChange([...value, { schedaId: id, note: "" }]);
    setSearch("");
  }
  function remove(id: string) {
    onChange(value.filter((r) => r.schedaId !== id));
  }
  function setNota(id: string, note: string) {
    onChange(value.map((r) => (r.schedaId === id ? { ...r, note } : r)));
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="space-y-1.5">
          {value.map((r) => {
            const s = schedeMap.get(r.schedaId);
            if (!s) return null;
            return (
              <div key={r.schedaId} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(240,143,37,0.06)" }}>
                <span className="text-xs font-medium whitespace-nowrap" style={{ color: "var(--color-primary)" }}>
                  {s.odp}{s.numeroScheda ? ` — ${s.numeroScheda}` : ""}
                </span>
                {schedeAltreCasse.has(r.schedaId) && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ background: "#FEF3C7", color: "#92400E" }}>
                    già in altra cassa
                  </span>
                )}
                <input
                  type="text"
                  className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                  placeholder="Nota (es. solo ante)…"
                  value={r.note}
                  onChange={(e) => setNota(r.schedaId, e.target.value)}
                />
                <button type="button" onClick={() => remove(r.schedaId)} className="hover:opacity-70 leading-none text-lg" style={{ color: "var(--color-grey-mid)" }}>×</button>
              </div>
            );
          })}
        </div>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          placeholder="Cerca Scheda da aggiungere…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); apri(); }}
          onFocus={apri}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && coords && filtrati.length > 0 && (
          <ul
            className="fixed z-[100] rounded-lg border bg-white shadow-lg overflow-y-auto"
            style={{ top: coords.top, left: coords.left, width: coords.width, borderColor: "#d1d5db", maxHeight: 220 }}
          >
            {filtrati.map((s) => (
              <li
                key={s.id}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-orange-50 flex items-center gap-2"
                onMouseDown={(e) => { e.preventDefault(); add(s.id); }}
              >
                <span className="font-semibold">{s.odp}</span>
                {s.numeroScheda && <span className="text-xs">— {s.numeroScheda}</span>}
                {schedeAltreCasse.has(s.id) && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#FEF3C7", color: "#92400E" }}>già in altra cassa</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {schedeDisponibili.length === 0 && (
        <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
          Nessuna Scheda &quot;Completato&quot; per questa Commessa ancora da mostrare qui.
        </p>
      )}
    </div>
  );
}

interface Props {
  cassa?: Cassa | null;
  commessaId: string;
  commessaLabel: string;
  schedeDisponibili: Scheda[]; // Schede della Commessa con stato "Completato"
  schedeAltreCasse: Set<string>; // id Schede già assegnate ad ALTRE casse (per il badge)
  onClose: () => void;
  onSave: (cassa: Cassa) => void;
}

export default function FormCassa({ cassa, commessaId, commessaLabel, schedeDisponibili, schedeAltreCasse, onClose, onSave }: Props) {
  const isEdit = !!cassa;
  const [form, setForm] = useState<FormState>({
    descrizione: cassa?.descrizione ?? "",
    note: cassa?.note ?? "",
    schede: cassa?.schede ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = isEdit
        ? { descrizione: form.descrizione, note: form.note, schede: form.schede }
        : { commessaId, descrizione: form.descrizione, note: form.note, schede: form.schede };
      const url = isEdit ? `/api/casse/${cassa!.id}` : "/api/casse";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore salvataggio");
      onSave(data as Cassa);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio. Riprova.");
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
            <h2 className="font-semibold text-base">{isEdit ? `Modifica Cassa ${cassa!.numero}` : "Nuova Cassa"}</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>{commessaLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Descrizione</label>
            <input type="text" className={inputCls} placeholder="es. Camera da letto" value={form.descrizione} onChange={(e) => set("descrizione", e.target.value)} />
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Note</label>
            <textarea rows={2} className={inputCls + " resize-none"} value={form.note} onChange={(e) => set("note", e.target.value)} />
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Schede in questa cassa</label>
            <CassaSchedeSelect
              schedeDisponibili={schedeDisponibili}
              schedeAltreCasse={schedeAltreCasse}
              value={form.schede}
              onChange={(righe) => set("schede", righe)}
            />
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
