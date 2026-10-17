"use client";

import { useMemo, useState } from "react";
import type { Carico, Commessa, Scheda } from "@/lib/types";
import SchedaCard from "./SchedaCard";

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

// Griglia di selezione ODP (stessa card di carichi/odp). Si propongono solo gli ODP della commessa
// del carico che non stanno in nessun altro carico (occupati) più quelli già in questo carico.
// Le sottoschede restano nascoste finché non si attiva l'interruttore (quelle già selezionate si vedono sempre).
function OdpGrid({ schede, value, onChange, occupati, commessaId }: { schede: Scheda[]; value: string[]; onChange: (ids: string[]) => void; occupati: Set<string>; commessaId: string | null }) {
  const [search, setSearch] = useState("");
  const [conSottoschede, setConSottoschede] = useState(false);
  const schedeMap = useMemo(() => new Map(schede.map((s) => [s.id, s])), [schede]);

  const visibili = useMemo(() => {
    const q = search.toLowerCase().trim();
    return schede
      .filter((s) => s.odp && !occupati.has(s.id) && commessaDi(s, schedeMap) === commessaId)
      .filter((s) => conSottoschede || s.tipologia === "Scheda" || value.includes(s.id))
      .filter((s) => !q || `${s.odp} ${s.numeroScheda} ${s.clienteInfo} ${s.codiceArticolo}`.toLowerCase().includes(q))
      .sort((a, b) => a.odp.localeCompare(b.odp, "it", { numeric: true }));
  }, [schede, schedeMap, search, conSottoschede, occupati, commessaId, value]);

  // Raggruppa per ODP principale: l'ODP (se visibile) e poi le sue sottoschede
  const gruppi = useMemo(() => {
    const rootDi = (s: Scheda): Scheda => {
      let cur = s;
      while (cur.parentId && schedeMap.get(cur.parentId)) cur = schedeMap.get(cur.parentId)!;
      return cur;
    };
    const map = new Map<string, { root: Scheda; items: Scheda[] }>();
    for (const s of visibili) {
      const root = rootDi(s);
      const g = map.get(root.id) ?? { root, items: [] };
      g.items.push(s);
      map.set(root.id, g);
    }
    for (const g of map.values()) g.items.sort((a, b) => (a.id === g.root.id ? -1 : b.id === g.root.id ? 1 : a.odp.localeCompare(b.odp, "it", { numeric: true })));
    return [...map.values()].sort((a, b) => a.root.odp.localeCompare(b.root.odp, "it", { numeric: true }));
  }, [visibili, schedeMap]);

  const selezionati = new Set(value);
  function toggle(id: string) {
    onChange(selezionati.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  }
  const tuttiSelezionati = visibili.length > 0 && visibili.every((s) => selezionati.has(s.id));
  function toggleTutti() {
    const ids = new Set(visibili.map((s) => s.id));
    onChange(tuttiSelezionati ? value.filter((v) => !ids.has(v)) : [...value, ...visibili.filter((s) => !selezionati.has(s.id)).map((s) => s.id)]);
  }

  if (!commessaId) {
    return (
      <p className="text-sm text-center py-10 rounded-xl border border-dashed" style={{ color: "var(--color-grey-mid)", borderColor: "#e5e4e0" }}>
        Seleziona prima la Commessa del carico: si possono aggiungere solo ODP di quella commessa.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          className="flex-1 min-w-[200px] border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          placeholder="Cerca per ODP, scheda, cliente, articolo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input type="checkbox" checked={conSottoschede} onChange={(e) => setConSottoschede(e.target.checked)} className="accent-orange-500" />
          Mostra sottoschede
        </label>
        <button type="button" onClick={toggleTutti} disabled={visibili.length === 0} className="px-3 py-2 text-sm rounded border font-medium hover:bg-gray-50 disabled:opacity-50">
          {tuttiSelezionati ? "Deseleziona visibili" : "Seleziona tutti i visibili"}
        </button>
        <span className="text-sm font-semibold" style={{ color: "var(--color-primary)" }}>{value.length} selezionati</span>
      </div>
      {visibili.length === 0 ? (
        <p className="text-sm text-center py-10 rounded-xl border border-dashed" style={{ color: "var(--color-grey-mid)", borderColor: "#e5e4e0" }}>
          Nessun ODP disponibile: quelli della commessa sono già tutti in un carico.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {gruppi.map(({ root, items }) => {
            if (items.length === 1 && items[0].id === root.id) {
              return <SchedaCard key={root.id} s={root} selected={selezionati.has(root.id)} onClick={() => toggle(root.id)} />;
            }
            // ODP con sottoschede: riquadro unico con l'ODP in testata, così si vede a chi appartengono
            return (
              <div key={root.id} className="col-span-full rounded-xl border-2 border-dashed p-3 space-y-2" style={{ borderColor: "#FCD34D", background: "#FFFBEB" }}>
                <p className="text-xs font-semibold" style={{ color: "#92400E" }}>
                  {root.odp}{root.clienteInfo ? ` · ${root.clienteInfo}` : ""} — sottoschede
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {items.map((s) => (
                    <SchedaCard key={s.id} s={s} sottoscheda={s.id !== root.id} selected={selezionati.has(s.id)} onClick={() => toggle(s.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Le sottoschede spesso non hanno commessa propria: vale quella del padre
function commessaDi(s: Scheda, schedeMap: Map<string, Scheda>): string | null {
  for (let cur: Scheda | undefined = s; cur; cur = cur.parentId ? schedeMap.get(cur.parentId) : undefined) if (cur.commessaId) return cur.commessaId;
  return null;
}

interface Props {
  carico?: Carico | null;
  commesse: Commessa[];
  schede: Scheda[];
  // Tutti i carichi, per sapere quali ODP sono già assegnati altrove
  carichi: Carico[];
  onClose: () => void;
  onSave: (carico: Carico) => void;
}

export default function FormCarico({ carico, commesse, schede, carichi, onClose, onSave }: Props) {
  const isEdit = !!carico;
  const [initialForm] = useState<FormState>(() => ({
    titolo: carico?.titolo ?? "",
    descrizione: carico?.descrizione ?? "",
    dataCarico: carico?.dataCarico ?? "",
    commessaId: carico?.commessaId ?? null,
    odpIds: carico?.odpIds ?? [],
    modalita: carico?.modalita ?? "",
    stato: carico?.stato ?? "Pianificato",
  }));
  const [form, setForm] = useState<FormState>(initialForm);
  // Con modifiche in corso il click fuori dal modal (es. rilasciando il mouse dopo una selezione di testo) non lo chiude
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const occupati = useMemo(() => {
    const m = new Set<string>();
    for (const c of carichi) {
      if (c.id === carico?.id) continue;
      for (const id of c.odpIds) m.add(id);
    }
    return m;
  }, [carichi, carico]);

  const schedeMap = useMemo(() => new Map(schede.map((s) => [s.id, s])), [schede]);

  // Cambiando commessa si tolgono gli ODP selezionati che non le appartengono
  function cambiaCommessa(id: string | null) {
    setForm((prev) => ({
      ...prev,
      commessaId: id,
      odpIds: prev.odpIds.filter((odpId) => { const s = schedeMap.get(odpId); return !!s && commessaDi(s, schedeMap) === id; }),
    }));
  }

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titolo.trim()) { setStep(1); setError("Titolo obbligatorio"); return; }
    if (!form.dataCarico) { setStep(1); setError("Data Carico obbligatoria"); return; }
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
      if (!res.ok) {
        // 409: ODP già in un altro carico — il messaggio del server dice quale
        if (res.status === 409) throw new Error((await res.json().catch(() => null))?.error ?? "ODP già assegnato a un altro carico");
        throw new Error("Errore salvataggio");
      }
      const saved: Carico = await res.json();
      onSave(saved);
    } catch (e) {
      setError(e instanceof Error && e.message !== "Errore salvataggio" ? e.message : "Errore durante il salvataggio. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300";
  const labelCls = "block text-xs font-medium mb-1";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={() => { if (!isDirty) onClose(); }}>
      <div
        className={`w-full ${step === 2 ? "max-w-5xl" : "max-w-2xl"} bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]`}
        style={{ borderRadius: "var(--radius-modal)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-base">{isEdit ? "Modifica Carico" : "Nuovo Carico"}{step === 2 ? " · ODP" : ""}</h2>
            {isEdit && (
              <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
                {carico!.titolo}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div className={step === 1 ? "space-y-5" : "hidden"}>
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
              <select className={inputCls} value={form.commessaId ?? ""} onChange={(e) => cambiaCommessa(e.target.value || null)}>
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

          </div>

          {step === 2 && (
            <div className="space-y-3">
              <div className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
                Commessa: <span className="font-semibold" style={{ color: "var(--color-black)" }}>
                  {commesse.find((c) => c.id === form.commessaId)?.numeroCommessa ?? "—"}
                </span>
              </div>
              <OdpGrid schede={schede} value={form.odpIds} onChange={(ids) => set("odpIds", ids)} occupati={occupati} commessaId={form.commessaId} />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            {step === 2 ? (
              <button type="button" onClick={() => setStep(1)} className="mr-auto px-4 py-2 text-sm rounded border font-medium hover:bg-gray-50 transition-colors">
                ← Dati carico
              </button>
            ) : (
              <button type="button" onClick={() => setStep(2)} className="mr-auto px-4 py-2 text-sm rounded border font-medium hover:bg-gray-50 transition-colors">
                Seleziona ODP ({form.odpIds.length}) →
              </button>
            )}
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
