"use client";

import { useEffect, useRef, useState } from "react";
import type { Scheda } from "@/lib/types";
import BadgeStato from "./BadgeStato";
import PdfAnnotatoreModal, { type AnnotazioneData } from "./PdfAnnotatoreModal";

interface Props {
  scheda: Scheda;
  figlie?: Scheda[];
  onClose: () => void;
  onRilavorazioneCreata?: () => void;
  onViewScheda?: (s: Scheda) => void;
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "#f8f7f5", border: "1px solid #ebe9e5" }}>
      <div className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9c9894" }}>{label}</div>
      <div className="text-sm font-medium" style={{ color: "var(--color-black)" }}>{value || "—"}</div>
    </div>
  );
}

interface Fornitore { id: string; nome: string }

async function compressPhoto(file: File, maxDim = 1400, quality = 0.82): Promise<string> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.src = url;
  });
}

type WizardStep = 1 | 2 | 3;

function RilavorazioneWizard({
  schedaId, schedaOdp, sourcePdfPageId, hasPdf, defaultFornitore, defaultQuantita, onSuccess, onCancel,
}: {
  schedaId: string;
  schedaOdp: string;
  sourcePdfPageId: string;
  hasPdf: boolean;
  defaultFornitore?: string;
  defaultQuantita?: number | null;
  onSuccess: (result: { pageId: string; odp: string }) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<WizardStep>(1);
  const [descrizione, setDescrizione] = useState("");
  const [quantita, setQuantita] = useState(defaultQuantita != null ? String(defaultQuantita) : "");
  const [fornitoreNome, setFornitoreNome] = useState(defaultFornitore ?? "");
  const [dataRientro, setDataRientro] = useState("");
  const [note, setNote] = useState("");
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [annotazioni, setAnnotazioni] = useState<AnnotazioneData>({ strokes: {}, stamps: {} });
  const [fotos, setFotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const totalSteps = hasPdf ? 3 : 1;

  useEffect(() => {
    fetch("/api/fornitori").then(r => r.json()).then(setFornitori).catch(() => {});
  }, []);

  function handleAnnotated(data: AnnotazioneData) {
    setAnnotazioni(data);
    setStep(3);
  }

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const compressed = await Promise.all(files.map(f => compressPhoto(f)));
    setFotos(prev => [...prev, ...compressed]);
    e.target.value = "";
  }

  async function submit() {
    if (!descrizione.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const hasAnnotation = Object.values(annotazioni.strokes).some(s => s.length > 0) ||
                            Object.values(annotazioni.stamps).some(s => s.length > 0);
      const body: Record<string, unknown> = {
        descrizione: descrizione.trim(),
        fornitoreNome: fornitoreNome || undefined,
        dataRientro: dataRientro || undefined,
        note: note || undefined,
        quantita: quantita ? Number(quantita) : undefined,
      };
      if (hasPdf && (hasAnnotation || fotos.length > 0)) {
        body.sourcePdfPageId = sourcePdfPageId;
        body.strokes = annotazioni.strokes;
        body.stamps = annotazioni.stamps;
        body.fotoBase64 = fotos;
      }
      const res = await fetch(`/api/schede/${schedaId}/rilavorazione`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; error?: string; pageId?: string; odp?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Errore creazione");
      onSuccess({ pageId: data.pageId ?? "", odp: data.odp ?? "" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-orange-300 transition-shadow";
  const inputStyle = { border: "1px solid #e5e4e0", background: "white", color: "var(--color-black)" };

  // Step 2 — fullscreen annotatore (sopra il modal corrente)
  if (step === 2) {
    return (
      <PdfAnnotatoreModal
        sourcePdfPageId={sourcePdfPageId}
        schedaOdp={schedaOdp}
        onClose={() => setStep(1)}
        onAnnotated={handleAnnotated}
      />
    );
  }

  const stepLabel = hasPdf
    ? step === 1 ? "1/3 — Dettagli" : "3/3 — Foto"
    : null;

  return (
    <div className="rounded-xl p-4 space-y-4 mt-2" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
      {stepLabel && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#92400E" }}>{stepLabel}</span>
          {hasPdf && (
            <div className="flex gap-1">
              {[1, 2, 3].map(n => (
                <div key={n} className="h-1 w-6 rounded-full" style={{ background: n <= (step === 3 ? 3 : step) ? "#D97706" : "#FDE68A" }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step 1: form ── */}
      {step === 1 && (
        <>
          <div className="text-sm font-semibold" style={{ color: "#92400E" }}>Nuova rilavorazione su {schedaOdp}</div>
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: "#92400E" }}>Descrizione pezzo *</label>
            <input type="text" value={descrizione} onChange={e => setDescrizione(e.target.value)}
              placeholder="Es. Cornice sx rovinata durante assemblaggio"
              className={inputCls} style={inputStyle} required autoFocus />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: "#92400E" }}>Quantità</label>
              <input type="number" min="1" value={quantita} onChange={e => setQuantita(e.target.value)}
                placeholder="es. 2" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: "#92400E" }}>Fornitore</label>
              <select value={fornitoreNome} onChange={e => setFornitoreNome(e.target.value)} className={inputCls} style={inputStyle}>
                <option value="">— nessuno —</option>
                {fornitori.map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: "#92400E" }}>Data rientro</label>
              <input type="date" value={dataRientro} onChange={e => setDataRientro(e.target.value)} className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: "#92400E" }}>Note</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="Motivazione, dettagli…" className={inputCls} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          {error && <p className="text-xs font-medium px-2 py-1.5 rounded-lg" style={{ color: "#991B1B", background: "#FEE2E2" }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} className="text-sm px-3 py-1.5 rounded-lg border font-medium"
              style={{ color: "var(--color-grey-mid)", borderColor: "#e5e4e0", background: "white" }}>
              Annulla
            </button>
            {hasPdf ? (
              <>
                <button type="button" onClick={submit} disabled={saving || !descrizione.trim()}
                  className="text-sm px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 border"
                  style={{ color: "#92400E", borderColor: "#FDE68A", background: "white" }}>
                  {saving ? "Creazione…" : "Crea senza PDF"}
                </button>
                <button type="button" onClick={() => setStep(2)} disabled={!descrizione.trim()}
                  className="text-sm px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50"
                  style={{ background: "#D97706", color: "white" }}>
                  Avanti: Annota PDF →
                </button>
              </>
            ) : (
              <button type="button" onClick={submit} disabled={saving || !descrizione.trim()}
                className="text-sm px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50"
                style={{ background: "#D97706", color: "white" }}>
                {saving ? "Creazione…" : "Crea Rilavorazione"}
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Step 3: foto ── */}
      {step === 3 && (
        <>
          <div className="text-sm font-semibold" style={{ color: "#92400E" }}>Aggiungi foto al PDF (opzionale)</div>
          <p className="text-xs" style={{ color: "#92400E" }}>
            Le foto verranno aggiunte come pagine in coda al PDF annotato.
          </p>
          <input ref={fotoInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleFoto} />
          <button type="button" onClick={() => fotoInputRef.current?.click()}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border font-medium w-full justify-center"
            style={{ borderColor: "#FDE68A", background: "white", color: "#92400E" }}>
            <span>📷</span> Scatta / seleziona foto
          </button>
          {fotos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {fotos.map((f, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f} alt="" className="w-20 h-20 object-cover rounded-lg border" style={{ borderColor: "#FDE68A" }} />
                  <button onClick={() => setFotos(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-xs flex items-center justify-center"
                    style={{ background: "#991B1B", color: "white" }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {error && <p className="text-xs font-medium px-2 py-1.5 rounded-lg" style={{ color: "#991B1B", background: "#FEE2E2" }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setStep(2)}
              className="text-sm px-3 py-1.5 rounded-lg border font-medium"
              style={{ color: "var(--color-grey-mid)", borderColor: "#e5e4e0", background: "white" }}>
              ← Indietro
            </button>
            <button type="button" onClick={submit} disabled={saving}
              className="text-sm px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50"
              style={{ background: "#D97706", color: "white" }}>
              {saving ? "Creazione…" : "Crea Rilavorazione"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function DettaglioSchedaModal({ scheda: s, figlie = [], onClose, onRilavorazioneCreata, onViewScheda }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [rilavorazioneCreata, setRilavorazioneCreata] = useState<{ pageId: string; odp: string } | null>(null);
  const [rientrando, setRientrando] = useState(false);
  const [rientroError, setRientroError] = useState<string | null>(null);
  const [rientroFatto, setRientroFatto] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const today = new Date().toISOString().slice(0, 10);
  const inRitardoProd = !["Completato", "Annullato"].includes(s.statoProduzione) && !!s.dataProduzionePrevista && s.dataProduzionePrevista < today;
  const inRitardoRientro = !["Completato", "Annullato"].includes(s.statoProduzione) && s.produzioneEsterna && !!s.dataRientroPrevista && s.dataRientroPrevista < today;
  const canHaveRilavorazione = s.tipologia === "Scheda" || s.tipologia === "Sottoscheda";
  const isInAttesaRilavorazione = s.statoProduzione === "In Attesa Rilavorazione";
  const hasPdf = s.pdfAllegato.length > 0;

  function handleRilavorazioneSuccess(result: { pageId: string; odp: string }) {
    setShowWizard(false);
    setRilavorazioneCreata(result);
    onRilavorazioneCreata?.();
  }

  async function handleRientro() {
    if (rientrando || rientroFatto) return;
    setRientrando(true);
    setRientroError(null);
    try {
      const res = await fetch(`/api/schede/${s.id}/rientro`, { method: "POST" });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Errore");
      setRientroFatto(true);
      onRilavorazioneCreata?.();
    } catch (err) {
      setRientroError((err as Error).message);
    } finally {
      setRientrando(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="relative flex flex-col rounded-2xl shadow-2xl overflow-hidden"
        style={{ width: "min(680px, 100%)", maxHeight: "92vh", background: "white" }}
      >
        {/* ── Header ── */}
        <div className="shrink-0 px-6 pt-5 pb-4 border-b" style={{ background: "#f3f2ef", borderColor: "#e5e4e0" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-mono font-bold text-2xl tracking-tight" style={{ color: "var(--color-black)" }}>
                  {s.odp || "—"}
                </span>
                {(s.commessaNr || s.clienteInfo) && (
                  <>
                    <span className="text-lg font-light" style={{ color: "#bbb" }}>—</span>
                    {s.commessaNr && <span className="text-base font-semibold" style={{ color: "var(--color-grey-mid)" }}>{s.commessaNr}</span>}
                    {s.clienteInfo && <span className="text-base font-medium truncate" style={{ color: "var(--color-grey-mid)" }}>{s.clienteInfo}</span>}
                  </>
                )}
              </div>
              {s.numeroScheda && (
                <div className="font-mono font-bold text-2xl tracking-tight mt-0.5" style={{ color: "var(--color-black)" }}>
                  {s.numeroScheda}
                </div>
              )}
              <div className="flex items-center gap-2 mt-3">
                <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>Stato di produzione</span>
                <BadgeStato stato={s.statoProduzione} className="text-sm px-3 py-1" />
                {s.faseCorrente && <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>· {s.faseCorrente}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <a href={s.notionUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-gray-100"
                  style={{ color: "var(--color-grey-mid)", border: "1px solid #d1d5db", background: "white" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                  </svg>
                  Notion
                </a>
                <button onClick={onClose}
                  className="flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-gray-200"
                  style={{ color: "var(--color-grey-mid)" }} aria-label="Chiudi">
                  ✕
                </button>
              </div>
              {canHaveRilavorazione && !rilavorazioneCreata && !showWizard && (
                <button onClick={() => setShowWizard(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
                  style={{
                    background: isInAttesaRilavorazione ? "#FEF9C3" : "linear-gradient(135deg,#F59E0B,#D97706)",
                    color: isInAttesaRilavorazione ? "#92400E" : "white",
                    border: isInAttesaRilavorazione ? "1px solid #FDE68A" : "none",
                    boxShadow: isInAttesaRilavorazione ? "none" : "0 2px 6px rgba(217,119,6,0.3)",
                  }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  {isInAttesaRilavorazione ? "Nuova rilavorazione" : "Invia in Rilavorazione"}
                </button>
              )}
              {rilavorazioneCreata && (
                <span className="text-xs font-medium px-2 py-1 rounded-lg" style={{ background: "#D1FAE5", color: "#065F46" }}>
                  ✓ {rilavorazioneCreata.odp} creata
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {showWizard && (
            <RilavorazioneWizard
              schedaId={s.id}
              schedaOdp={s.odp}
              sourcePdfPageId={s.id}
              hasPdf={hasPdf}
              defaultFornitore={s.fornitore || undefined}
              defaultQuantita={s.quantita}
              onSuccess={handleRilavorazioneSuccess}
              onCancel={() => setShowWizard(false)}
            />
          )}

          {/* ── Rientro rilavorazione ── */}
          {s.tipologia === "Rilavorazione" && !["Completato", "Annullato"].includes(s.statoProduzione) && !rientroFatto && (
            <div className="rounded-xl px-4 py-3 space-y-2" style={{ background: "#F0FDF4", border: "1px solid #86EFAC" }}>
              <div className="text-sm font-semibold" style={{ color: "#14532D" }}>Rientro rilavorazione</div>
              <p className="text-xs" style={{ color: "#166534" }}>
                Quando il pezzo torna dalla rilavorazione, segna il rientro per sbloccare la scheda padre.
              </p>
              {rientroError && <p className="text-xs font-medium px-2 py-1 rounded" style={{ color: "#991B1B", background: "#FEE2E2" }}>{rientroError}</p>}
              <button onClick={handleRientro} disabled={rientrando}
                className="text-sm px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ background: "#16A34A", color: "white" }}>
                {rientrando ? "Aggiornamento…" : "✓ Segna Rientrata"}
              </button>
            </div>
          )}
          {rientroFatto && (
            <div className="rounded-xl px-4 py-3" style={{ background: "#F0FDF4", border: "1px solid #86EFAC" }}>
              <span className="text-sm font-semibold" style={{ color: "#14532D" }}>✓ Rilavorazione completata — scheda padre sbloccata</span>
            </div>
          )}

          {/* ── Sottoschede / Rilavorazioni ── */}
          {figlie.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>
                {figlie.some(f => f.tipologia === "Rilavorazione") ? "Sottoschede / Rilavorazioni" : "Sottoschede"}
              </h3>
              <div className="space-y-1.5">
                {figlie.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
                    style={{
                      background: f.tipologia === "Rilavorazione" ? "#FFFBEB" : "#f8f7f5",
                      border: `1px solid ${f.tipologia === "Rilavorazione" ? "#FDE68A" : "#ebe9e5"}`,
                    }}>
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="font-mono text-sm font-bold shrink-0" style={{ color: f.tipologia === "Rilavorazione" ? "#92400E" : "var(--color-black)" }}>
                        {f.tipologia === "Rilavorazione" ? "⚙ " : "↳ "}{f.odp || f.numeroScheda || "—"}
                      </span>
                      {f.numeroScheda && f.numeroScheda !== f.odp && (
                        <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{f.numeroScheda}</span>
                      )}
                      <BadgeStato stato={f.statoProduzione} />
                      {f.pdfAllegato.length > 0 && (
                        <a href={`/api/files/${f.id}?prop=${encodeURIComponent("PDF Allegato")}&index=0`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                          style={{ color: "#DC2626" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/></svg>
                          PDF
                        </a>
                      )}
                    </div>
                    {onViewScheda && (
                      <button onClick={() => { onViewScheda(f); }}
                        className="shrink-0 text-xs px-2.5 py-1 rounded-lg font-semibold border transition-opacity hover:opacity-80"
                        style={{ color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.3)", background: "rgba(240,143,37,0.06)" }}>
                        Apri →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {(inRitardoProd || inRitardoRientro) && (
            <div className="rounded-xl px-4 py-3 space-y-1" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5" }}>
              {inRitardoProd && <div className="text-sm font-medium" style={{ color: "#991B1B" }}>⚠ Produzione in ritardo — prevista il {fmt(s.dataProduzionePrevista)}</div>}
              {inRitardoRientro && <div className="text-sm font-medium" style={{ color: "#991B1B" }}>⚠ Rientro materiale in ritardo — previsto il {fmt(s.dataRientroPrevista)}</div>}
            </div>
          )}

          {s.copertina && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.copertina} alt="Copertina" className="w-full rounded-xl object-contain border"
              style={{ maxHeight: 260, borderColor: "#ebe9e5" }} />
          )}

          <section className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>Dati scheda</h3>
            <div className="grid grid-cols-2 gap-2">
              {s.codiceArticolo && <InfoItem label="Codice Articolo" value={s.codiceArticolo} />}
              <InfoItem label="Tipologia" value={s.tipologia} />
              {s.quantita != null && <InfoItem label="Quantità" value={String(s.quantita)} />}
              {s.posizione && <InfoItem label="Posizione" value={s.posizione} />}
              {s.areaLabel && <InfoItem label="Area / Cartella" value={s.areaLabel} />}
              {s.commessaNr && <InfoItem label="Commessa" value={s.commessaNr} />}
            </div>
            {s.descrizioneFasi && (
              <div className="rounded-lg px-3 py-2.5" style={{ background: "#f8f7f5", border: "1px solid #ebe9e5" }}>
                <div className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9c9894" }}>Descrizione / Fasi</div>
                <div className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-black)" }}>{s.descrizioneFasi}</div>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>Date</h3>
            <div className="grid grid-cols-2 gap-2">
              <InfoItem label="Scheda ricevuta" value={fmt(s.dataSchedaRicevuta)} />
              <InfoItem label="Produzione prevista" value={
                <span style={inRitardoProd ? { color: "#991B1B", fontWeight: 700 } : undefined}>
                  {fmt(s.dataProduzionePrevista)}
                </span>
              } />
            </div>
          </section>

          {s.produzioneEsterna && (
            <section className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>Produzione esterna</h3>
              <div className="grid grid-cols-2 gap-2">
                {s.fornitore && <InfoItem label="Fornitore" value={s.fornitore} />}
                {s.ordineFornitore && <InfoItem label="Ordine fornitore" value={s.ordineFornitore} />}
                {s.statoProdEsterna && <InfoItem label="Stato est." value={<BadgeStato stato={s.statoProdEsterna} />} />}
                <InfoItem label="Uscita materiale" value={fmt(s.dataUscitaMateriale)} />
                <InfoItem label="Rientro previsto" value={
                  <span style={inRitardoRientro ? { color: "#991B1B", fontWeight: 700 } : undefined}>
                    {fmt(s.dataRientroPrevista)}
                  </span>
                } />
                <InfoItem label="Rientro effettivo" value={fmt(s.dataRientroEffettiva)} />
              </div>
              {s.pdfOrdineFornitore.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-1">
                  {s.pdfOrdineFornitore.map((pdf, i) => (
                    <a key={i} href={pdf.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors hover:opacity-80"
                      style={{ borderColor: "#c7d2fe", color: "#4338ca", background: "#eef2ff" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
                      </svg>
                      {pdf.name || `Ordine Fornitore ${i > 0 ? i + 1 : ""}`}
                    </a>
                  ))}
                </div>
              )}
            </section>
          )}

          {s.pdfAllegato.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>PDF allegati</h3>
              <div className="flex flex-col gap-1.5">
                {s.pdfAllegato.map((pdf, i) => (
                  <a key={i} href={pdf.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors hover:opacity-80"
                    style={{ borderColor: "#FCA5A5", color: "#DC2626", background: "#FFF5F5" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
                    </svg>
                    {pdf.name || (s.pdfAllegato.length > 1 ? `PDF ${i + 1}` : "Apri PDF")}
                  </a>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
