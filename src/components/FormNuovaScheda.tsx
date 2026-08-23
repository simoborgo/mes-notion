"use client";

import { useEffect, useState } from "react";
import type { Scheda, Commessa, Area } from "@/lib/types";
import FormArea from "./FormArea";

// Locale (mai toISOString/UTC-shift) — precompila "Data Scheda Ricevuta" a oggi, coerente con
// l'import automatico (import-scheda/route.ts) che la imposta sempre a "oggi" senza chiederla.
function oggiLocale(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface Props {
  commesse: Commessa[];
  onClose: () => void;
  onCreated: (scheda: Scheda) => void;
}

export default function FormNuovaScheda({ commesse, onClose, onCreated }: Props) {
  const [numeroScheda, setNumeroScheda] = useState("");
  const [commessaId, setCommessaId] = useState("");
  const [codiceArticolo, setCodiceArticolo] = useState("");
  const [posizione, setPosizione] = useState("");
  const [quantita, setQuantita] = useState<string>("");
  const [dataSchedaRicevuta, setDataSchedaRicevuta] = useState(oggiLocale());
  const [dataProduzionePrevista, setDataProduzionePrevista] = useState("");
  const [note, setNote] = useState("");
  const [produzioneEsterna, setProduzioneEsterna] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [aree, setAree] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState("");
  const [showFormArea, setShowFormArea] = useState(false);

  useEffect(() => {
    if (!commessaId) return;
    let cancelled = false;
    fetch(`/api/aree?commessaId=${commessaId}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setAree(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setAree([]); });
    return () => { cancelled = true; };
  }, [commessaId]);

  function handleCommessaChange(id: string) {
    setCommessaId(id);
    setAreaId("");
    if (!id) setAree([]);
  }

  function handleAreaCreata(area: Area) {
    setAree((prev) => [...prev, area]);
    setAreaId(area.id);
    setShowFormArea(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!numeroScheda.trim()) {
      setError("Numero Scheda obbligatorio");
      return;
    }
    if (!dataSchedaRicevuta) {
      setError("Data Scheda Ricevuta obbligatoria");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/schede", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numeroScheda: numeroScheda.trim(),
          commessaId: commessaId || null,
          areaId: areaId || null,
          codiceArticolo: codiceArticolo || null,
          posizione: posizione || null,
          quantita: quantita === "" ? null : Number(quantita),
          dataSchedaRicevuta: dataSchedaRicevuta || null,
          dataProduzionePrevista: dataProduzionePrevista || null,
          note: note || null,
          produzioneEsterna,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore creazione scheda");
      onCreated(data as Scheda);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore creazione scheda");
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
          <h2 className="font-semibold text-base">Nuova Scheda</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Commessa</label>
              <select className={inputCls} value={commessaId} onChange={(e) => handleCommessaChange(e.target.value)}>
                <option value="">— nessuna —</option>
                {commesse.map((c) => (
                  <option key={c.id} value={c.id}>{c.numeroCommessa} — {c.cliente}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Area / Cartella</label>
              <div className="flex gap-2">
                <select className={inputCls} value={areaId} onChange={(e) => setAreaId(e.target.value)} disabled={!commessaId}>
                  <option value="">— nessuna —</option>
                  {aree.map((a) => (
                    <option key={a.id} value={a.id}>{a.nomeArredo || "—"}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowFormArea(true)}
                  disabled={!commessaId}
                  className="px-3 py-2 text-sm rounded border font-medium whitespace-nowrap hover:bg-gray-50 transition-colors disabled:opacity-50"
                  style={{ color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.3)" }}
                >
                  + Nuova
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Numero Scheda *</label>
              <input type="text" required className={inputCls} value={numeroScheda} onChange={(e) => setNumeroScheda(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Codice Articolo</label>
              <input type="text" className={inputCls} value={codiceArticolo} onChange={(e) => setCodiceArticolo(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Posizione</label>
              <input type="text" className={inputCls} value={posizione} onChange={(e) => setPosizione(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Quantità</label>
              <input type="number" min="0" className={inputCls} value={quantita} onChange={(e) => setQuantita(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Scheda Ricevuta *</label>
              <input type="date" required className={inputCls} value={dataSchedaRicevuta} onChange={(e) => setDataSchedaRicevuta(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Produzione Prevista</label>
              <input type="date" className={inputCls} value={dataProduzionePrevista} onChange={(e) => setDataProduzionePrevista(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="nuova-scheda-esterna"
              type="checkbox"
              checked={produzioneEsterna}
              onChange={(e) => setProduzioneEsterna(e.target.checked)}
              className="w-4 h-4 accent-orange-500"
            />
            <label htmlFor="nuova-scheda-esterna" className="text-sm font-medium">Produzione Esterna</label>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Note</label>
            <textarea rows={3} className={inputCls + " resize-none"} value={note} onChange={(e) => setNote(e.target.value)} />
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
              {saving ? "Creazione…" : "Crea Scheda"}
            </button>
          </div>
        </form>
      </div>
      {showFormArea && commessaId && (
        <FormArea
          commessaId={commessaId}
          onClose={() => setShowFormArea(false)}
          onSaved={handleAreaCreata}
        />
      )}
    </div>
  );
}
