"use client";

import { useEffect, useRef, useState } from "react";
import type { Scheda } from "@/lib/types";
import { FERRAMENTA_ROLES, type Role } from "@/lib/roles";
import BadgeStato from "./BadgeStato";
import PdfAnnotatoreModal, { type AnnotazioneData } from "./PdfAnnotatoreModal";
import FormModificaScheda from "./FormModificaScheda";
import FormNuovaSottoscheda from "./FormNuovaSottoscheda";
import KitFerramentaTab from "./KitFerramentaTab";

interface Props {
  scheda: Scheda;
  figlie?: Scheda[];
  onClose: () => void;
  onRilavorazioneCreata?: () => void;
  onViewScheda?: (s: Scheda) => void;
  userRole?: Role;
  onSchedaAggiornata?: (updated: Scheda) => void;
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "#f8f7f5", border: "1px solid #ebe9e5" }}>
      <div className="text-[12.1px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9c9894" }}>{label}</div>
      <div className="text-[15.4px] font-medium" style={{ color: "var(--color-black)" }}>{value || "—"}</div>
    </div>
  );
}

// Badge per i campi essenziali vuoti — al posto di sparire (InfoItem sotto un `x &&`) o di un
// "—" neutro, un vero segnale che manca un dato, non solo che non c'è nulla da mostrare.
function Mancante() {
  return <span className="font-bold px-1.5 py-0.5 rounded" style={{ background: "#FEF3C7", color: "#92400E" }}>MANCANTE</span>;
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
  onSuccess: (result: { pageId: string; odp: string; ritiroCreato: boolean }) => void;
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
  const [creaRitiro, setCreaRitiro] = useState(true);
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
        creaRitiro: creaRitiro && !!fornitoreNome,
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
      const data = await res.json() as { ok: boolean; error?: string; pageId?: string; odp?: string; ritiroCreato?: boolean };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Errore creazione");
      onSuccess({ pageId: data.pageId ?? "", odp: data.odp ?? "", ritiroCreato: data.ritiroCreato ?? false });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full text-[15.4px] px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-orange-300 transition-shadow";
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
          <span className="text-[13.2px] font-bold uppercase tracking-widest" style={{ color: "#92400E" }}>{stepLabel}</span>
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
          <div className="text-[15.4px] font-semibold" style={{ color: "#92400E" }}>Nuova rilavorazione su {schedaOdp}</div>
          <div>
            <label className="text-[13.2px] font-semibold block mb-1" style={{ color: "#92400E" }}>Descrizione pezzo *</label>
            <input type="text" value={descrizione} onChange={e => setDescrizione(e.target.value)}
              placeholder="Es. Cornice sx rovinata durante assemblaggio"
              className={inputCls} style={inputStyle} required autoFocus />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[13.2px] font-semibold block mb-1" style={{ color: "#92400E" }}>Quantità</label>
              <input type="number" min="1" value={quantita} onChange={e => setQuantita(e.target.value)}
                placeholder="es. 2" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-[13.2px] font-semibold block mb-1" style={{ color: "#92400E" }}>Fornitore</label>
              <select value={fornitoreNome} onChange={e => setFornitoreNome(e.target.value)} className={inputCls} style={inputStyle}>
                <option value="">— nessuno —</option>
                {fornitori.map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[13.2px] font-semibold block mb-1" style={{ color: "#92400E" }}>Data rientro</label>
              <input type="date" value={dataRientro} onChange={e => setDataRientro(e.target.value)} className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="text-[13.2px] font-semibold block mb-1" style={{ color: "#92400E" }}>Note</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="Motivazione, dettagli…" className={inputCls} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          {/* Flag ritiro — visibile solo se c'è un fornitore */}
          {fornitoreNome && (
            <label className="flex items-center gap-2 cursor-pointer select-none text-[13.2px]" style={{ color: "#92400E" }}>
              <input type="checkbox" checked={creaRitiro} onChange={e => setCreaRitiro(e.target.checked)}
                className="w-4 h-4 accent-amber-600 cursor-pointer" />
              Crea riga in <strong>Ritiri e Consegne</strong> + notifica Telegram
            </label>
          )}
          {error && <p className="text-[13.2px] font-medium px-2 py-1.5 rounded-lg" style={{ color: "#991B1B", background: "#FEE2E2" }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} className="text-[15.4px] px-3 py-1.5 rounded-lg border font-medium"
              style={{ color: "var(--color-grey-mid)", borderColor: "#e5e4e0", background: "white" }}>
              Annulla
            </button>
            {hasPdf ? (
              <>
                <button type="button" onClick={submit} disabled={saving || !descrizione.trim()}
                  className="text-[15.4px] px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 border"
                  style={{ color: "#92400E", borderColor: "#FDE68A", background: "white" }}>
                  {saving ? "Creazione…" : "Crea senza PDF"}
                </button>
                <button type="button" onClick={() => setStep(2)} disabled={!descrizione.trim()}
                  className="text-[15.4px] px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50"
                  style={{ background: "#D97706", color: "white" }}>
                  Avanti: Annota PDF →
                </button>
              </>
            ) : (
              <button type="button" onClick={submit} disabled={saving || !descrizione.trim()}
                className="text-[15.4px] px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50"
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
          <div className="text-[15.4px] font-semibold" style={{ color: "#92400E" }}>Aggiungi foto al PDF (opzionale)</div>
          <p className="text-[13.2px]" style={{ color: "#92400E" }}>
            Le foto verranno aggiunte come pagine in coda al PDF annotato.
          </p>
          <input ref={fotoInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleFoto} />
          <button type="button" onClick={() => fotoInputRef.current?.click()}
            className="flex items-center gap-2 text-[15.4px] px-3 py-2 rounded-lg border font-medium w-full justify-center"
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
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-[13.2px] flex items-center justify-center"
                    style={{ background: "#991B1B", color: "white" }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {error && <p className="text-[13.2px] font-medium px-2 py-1.5 rounded-lg" style={{ color: "#991B1B", background: "#FEE2E2" }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setStep(2)}
              className="text-[15.4px] px-3 py-1.5 rounded-lg border font-medium"
              style={{ color: "var(--color-grey-mid)", borderColor: "#e5e4e0", background: "white" }}>
              ← Indietro
            </button>
            <button type="button" onClick={submit} disabled={saving}
              className="text-[15.4px] px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50"
              style={{ background: "#D97706", color: "white" }}>
              {saving ? "Creazione…" : "Crea Rilavorazione"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function DettaglioSchedaModal({ scheda: s, figlie = [], onClose, onRilavorazioneCreata, onViewScheda, userRole, onSchedaAggiornata }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [rilavorazioneCreata, setRilavorazioneCreata] = useState<{ pageId: string; odp: string; ritiroCreato: boolean } | null>(null);
  const [rientrando, setRientrando] = useState(false);
  const [rientroError, setRientroError] = useState<string | null>(null);
  const [rientroFatto, setRientroFatto] = useState(false);
  const [showNuovaSottoscheda, setShowNuovaSottoscheda] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [eliminaError, setEliminaError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "fornitore" | "kit">("info");
  const [showNoteStato, setShowNoteStato] = useState(false);
  const canFerramenta = !!userRole && FERRAMENTA_ROLES.includes(userRole);

  const tabs: { key: "info" | "fornitore" | "kit"; label: string; icon: React.ReactNode }[] = [
    {
      key: "info", label: "Info",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      ),
    },
    {
      key: "fornitore", label: "Fornitore Esterno",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      ),
    },
    ...(canFerramenta ? [{
      key: "kit" as const, label: "Kit Ferramenta",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    }] : []),
  ];

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
  const inLavorazione = !["Completato", "Annullata"].includes(s.statoProduzione);
  const inRitardoProd = inLavorazione && !!s.dataProduzionePrevista && s.dataProduzionePrevista < today;
  const inRitardoRientro = inLavorazione && s.produzioneEsterna && !!s.dataRientroPrevista && s.dataRientroPrevista < today;
  // Solo mentre "in lavorazione": una volta Completata/Annullata i giorni trascorsi da allora
  // non sono più "lavoro in corso" — mostrare comunque il conteggio sarebbe fuorviante (WIP =
  // Work In Progress), e non esiste una data di completamento da cui congelarlo.
  const giorniWip = inLavorazione && s.dataSchedaRicevuta
    ? Math.max(0, Math.floor((new Date().getTime() - new Date(s.dataSchedaRicevuta).getTime()) / 86_400_000))
    : null;
  const canHaveRilavorazione = s.tipologia === "Scheda" || s.tipologia === "Sottoscheda";
  const isInAttesaRilavorazione = s.statoProduzione === "In Attesa Rilavorazione";
  const hasPdf = s.pdfAllegato.length > 0;

  function handleRilavorazioneSuccess(result: { pageId: string; odp: string; ritiroCreato: boolean }) {
    setShowWizard(false);
    setRilavorazioneCreata(result);
    onRilavorazioneCreata?.();
  }

  function handleSottoschedaCreata() {
    setShowNuovaSottoscheda(false);
    onRilavorazioneCreata?.();
  }

  async function handleElimina() {
    if (eliminando) return;
    const avviso = figlie.length > 0
      ? `Questa scheda ha ${figlie.length} sottoschede/rilavorazioni collegate: resteranno raggiungibili solo tramite i loro link diretti, non più elencate qui.\n\nEliminare comunque "${s.numeroScheda || s.odp}"?`
      : `Eliminare "${s.numeroScheda || s.odp}"?`;
    if (!confirm(avviso)) return;
    setEliminando(true);
    setEliminaError(null);
    try {
      const res = await fetch(`/api/schede/${s.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore eliminazione");
      onClose();
      onRilavorazioneCreata?.();
    } catch (err) {
      setEliminaError(err instanceof Error ? err.message : "Errore eliminazione");
      setEliminando(false);
    }
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
              <div className="font-mono font-bold text-[26.4px] tracking-tight truncate" style={{ color: "var(--color-black)" }}>
                {s.odp || "—"}{s.numeroScheda ? ` - ${s.numeroScheda}` : ""}
              </div>
              {(s.commessaNr || s.clienteInfo) && (
                <div className="text-[17.6px] font-medium mt-0.5 truncate" style={{ color: "var(--color-grey-mid)" }}>
                  {s.commessaNr}{s.commessaNr && s.clienteInfo ? " - " : ""}{s.clienteInfo}
                </div>
              )}
              {giorniWip != null && (
                <div className="text-[13.2px] mt-2" style={{ color: "var(--color-grey-mid)" }}>
                  In produzione da {fmt(s.dataSchedaRicevuta)} · Giorni in produzione (WIP): <strong style={{ color: "var(--color-black)" }}>{giorniWip}</strong>
                </div>
              )}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-[12.1px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>Stato di produzione</span>
                <BadgeStato stato={s.statoProduzione} className="text-[15.4px] px-3 py-1" />
                {s.faseCorrente && <span className="text-[13.2px]" style={{ color: "var(--color-grey-mid)" }}>· {s.faseCorrente}</span>}
                {s.noteStato && (
                  <button
                    type="button"
                    onClick={() => setShowNoteStato(v => !v)}
                    title={s.noteStato}
                    className="text-[13.2px] underline decoration-dotted"
                    style={{ color: "var(--color-primary)" }}
                  >
                    note ⓘ
                  </button>
                )}
              </div>
              {showNoteStato && s.noteStato && (
                <div className="mt-2 text-[13.2px] rounded-lg px-3 py-2" style={{ background: "white", border: "1px solid #e5e4e0", color: "var(--color-black)", maxWidth: 420 }}>
                  {s.noteStato}
                </div>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-[12.1px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>Produzione Prevista</span>
                <span
                  className="text-[15.4px] font-semibold"
                  style={{ color: !s.dataProduzionePrevista ? "var(--color-grey-mid)" : inRitardoProd ? "#DC2626" : "#16A34A" }}
                >
                  {fmt(s.dataProduzionePrevista)}
                </span>
              </div>
            </div>
            <button onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-gray-200 shrink-0"
              style={{ color: "var(--color-grey-mid)" }} aria-label="Chiudi">
              ✕
            </button>
          </div>

          {/* ── Riga comandi (spostata qui per lasciare libero il testo del titolo sopra) ── */}
          <div className="flex items-center gap-2 flex-wrap mt-4">
            {(userRole === "admin" || userRole === "produzione") && (
              <button onClick={() => setShowEditForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13.2px] font-medium transition-colors hover:bg-gray-100"
                style={{ color: "var(--color-grey-mid)", border: "1px solid #d1d5db", background: "white" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
                </svg>
                Modifica
              </button>
            )}
            {(userRole === "admin" || userRole === "produzione") && (
              <button onClick={handleElimina} disabled={eliminando}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13.2px] font-medium transition-colors hover:bg-red-50 disabled:opacity-50"
                style={{ color: "#DC2626", border: "1px solid #fecaca", background: "white" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
                </svg>
                {eliminando ? "Elimino…" : "Elimina"}
              </button>
            )}
            {s.tipologia === "Scheda" && (userRole === "admin" || userRole === "produzione") && (
              <button onClick={() => setShowNuovaSottoscheda(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13.2px] font-medium transition-colors hover:bg-gray-100"
                style={{ color: "var(--color-grey-mid)", border: "1px solid #d1d5db", background: "white" }}>
                + Sottoscheda
              </button>
            )}
            {canHaveRilavorazione && !rilavorazioneCreata && !showWizard && (userRole === "admin" || userRole === "produzione") && (
              <button onClick={() => setShowWizard(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13.2px] font-semibold transition-opacity hover:opacity-90"
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
              <span className="text-[13.2px] font-medium px-2 py-1 rounded-lg" style={{ background: "#D1FAE5", color: "#065F46" }}>
                ✓ {rilavorazioneCreata.odp} creata
              </span>
            )}
          </div>
          {eliminaError && <p className="text-[13.2px] mt-2" style={{ color: "#DC2626" }}>{eliminaError}</p>}
        </div>

        {/* ── Tab "a cartellina" stile Impostazioni (striscia grigia + tab attiva che "sale" e si
             fonde col pannello bianco sottostante) — nessuna tab se c'è solo "Info" da mostrare. ── */}
        {tabs.length > 1 && (
          <div className="shrink-0 flex flex-wrap" style={{ background: "#EDE9E3", borderBottom: "1px solid #e5e4e0" }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className="flex items-center gap-2 px-5 py-3 text-[15.4px] font-semibold transition-all"
                style={activeTab === t.key
                  ? { background: "white", color: "var(--color-black)", borderTop: "2px solid var(--color-primary)", marginBottom: -1 }
                  : { background: "transparent", color: "var(--color-grey-mid)", borderTop: "2px solid transparent", marginBottom: -1 }}
              >
                <span style={{ color: activeTab === t.key ? "var(--color-primary)" : "currentColor" }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {activeTab === "kit" && canFerramenta && <KitFerramentaTab scheda={s} />}

          {activeTab === "fornitore" && (
            <section className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <InfoItem label="Fornitore" value={s.fornitore || <Mancante />} />
                <InfoItem label="Stato Produzione Esterna" value={s.statoProdEsterna ? <BadgeStato stato={s.statoProdEsterna} /> : <Mancante />} />
                <InfoItem label="Uscita materiale" value={fmt(s.dataUscitaMateriale)} />
                <InfoItem label="Rientro previsto" value={
                  s.dataRientroPrevista ? (
                    <span style={inRitardoRientro ? { color: "#991B1B", fontWeight: 700 } : undefined}>
                      {fmt(s.dataRientroPrevista)}
                    </span>
                  ) : <Mancante />
                } />
                <InfoItem label="Rientro effettivo" value={fmt(s.dataRientroEffettiva)} />
              </div>
              <div className="rounded-lg px-3 py-2.5" style={{ background: "#f8f7f5", border: "1px solid #ebe9e5" }}>
                <div className="text-[12.1px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9c9894" }}>Ordine Fornitore</div>
                {s.pdfOrdineFornitore.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {s.pdfOrdineFornitore.map((pdf, i) => (
                      <a key={i} href={pdf.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-[15.4px] font-medium transition-colors hover:opacity-80 w-fit"
                        style={{ borderColor: "#c7d2fe", color: "#4338ca", background: "#eef2ff" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
                        </svg>
                        {pdf.name || `Ordine Fornitore ${i > 0 ? i + 1 : ""}`}
                      </a>
                    ))}
                  </div>
                ) : <Mancante />}
              </div>
            </section>
          )}

          {activeTab === "info" && <>

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

          {rilavorazioneCreata && !rilavorazioneCreata.ritiroCreato && (
            <div className="rounded-xl px-4 py-3 space-y-1" style={{ background: "#FFFBEB", border: "1px solid #FCD34D" }}>
              <div className="text-[15.4px] font-semibold" style={{ color: "#92400E" }}>⚠ Nessun ritiro creato</div>
              <p className="text-[13.2px]" style={{ color: "#92400E" }}>
                La rilavorazione {rilavorazioneCreata.odp} è stata creata, ma senza fornitore non è stata generata alcuna riga in Ritiri e Consegne — vai lì e creane una manualmente, altrimenti nessuno saprà che il pezzo va ritirato.
              </p>
            </div>
          )}

          {/* ── Rientro rilavorazione ── */}
          {s.tipologia === "Rilavorazione" && !["Completato", "Annullata"].includes(s.statoProduzione) && !rientroFatto && (
            <div className="rounded-xl px-4 py-3 space-y-2" style={{ background: "#F0FDF4", border: "1px solid #86EFAC" }}>
              <div className="text-[15.4px] font-semibold" style={{ color: "#14532D" }}>Rientro rilavorazione</div>
              <p className="text-[13.2px]" style={{ color: "#166534" }}>
                Quando il pezzo torna dalla rilavorazione, segna il rientro per sbloccare la scheda padre.
              </p>
              {rientroError && <p className="text-[13.2px] font-medium px-2 py-1 rounded" style={{ color: "#991B1B", background: "#FEE2E2" }}>{rientroError}</p>}
              <button onClick={handleRientro} disabled={rientrando}
                className="text-[15.4px] px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ background: "#16A34A", color: "white" }}>
                {rientrando ? "Aggiornamento…" : "✓ Segna Rientrata"}
              </button>
            </div>
          )}
          {rientroFatto && (
            <div className="rounded-xl px-4 py-3" style={{ background: "#F0FDF4", border: "1px solid #86EFAC" }}>
              <span className="text-[15.4px] font-semibold" style={{ color: "#14532D" }}>✓ Rilavorazione completata — scheda padre sbloccata</span>
            </div>
          )}

          {/* ── Sottoschede / Rilavorazioni ── */}
          {figlie.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-[12.1px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>
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
                      <span className="font-mono text-[15.4px] font-bold shrink-0" style={{ color: f.tipologia === "Rilavorazione" ? "#92400E" : "var(--color-black)" }}>
                        {f.tipologia === "Rilavorazione" ? "⚙ " : "↳ "}{f.odp || f.numeroScheda || "—"}
                      </span>
                      {f.numeroScheda && f.numeroScheda !== f.odp && (
                        <span className="text-[13.2px]" style={{ color: "var(--color-grey-mid)" }}>{f.numeroScheda}</span>
                      )}
                      <BadgeStato stato={f.statoProduzione} />
                      {f.pdfAllegato.length > 0 && (
                        <a href={f.pdfAllegato[0].url}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[13.2px] font-medium hover:underline"
                          style={{ color: "#DC2626" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/></svg>
                          PDF
                        </a>
                      )}
                    </div>
                    {onViewScheda && (
                      <button onClick={() => { onViewScheda(f); }}
                        className="shrink-0 text-[13.2px] px-2.5 py-1 rounded-lg font-semibold border transition-opacity hover:opacity-80"
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
              {inRitardoProd && <div className="text-[15.4px] font-medium" style={{ color: "#991B1B" }}>⚠ Produzione in ritardo — prevista il {fmt(s.dataProduzionePrevista)}</div>}
              {inRitardoRientro && <div className="text-[15.4px] font-medium" style={{ color: "#991B1B" }}>⚠ Rientro materiale in ritardo — previsto il {fmt(s.dataRientroPrevista)}</div>}
            </div>
          )}

          {s.copertina && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.copertina} alt="Copertina" className="w-full rounded-xl object-contain border"
              style={{ maxHeight: 260, borderColor: "#ebe9e5" }} />
          )}

          <section className="space-y-2">
            <h3 className="text-[12.1px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>Dati scheda</h3>
            <div className="grid grid-cols-2 gap-2">
              <InfoItem label="Codice Articolo" value={s.codiceArticolo || <Mancante />} />
              <InfoItem label="Tipologia" value={s.tipologia} />
              {s.quantita != null && <InfoItem label="Quantità" value={String(s.quantita)} />}
              {s.posizione && <InfoItem label="Posizione" value={s.posizione} />}
              {s.areaLabel && <InfoItem label="Area / Cartella" value={s.areaLabel} />}
              {s.commessaNr && <InfoItem label="Commessa" value={s.commessaNr} />}
            </div>
            {s.descrizioneFasi && (
              <div className="rounded-lg px-3 py-2.5" style={{ background: "#f8f7f5", border: "1px solid #ebe9e5" }}>
                <div className="text-[12.1px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9c9894" }}>Descrizione / Fasi</div>
                <div className="text-[15.4px] whitespace-pre-wrap" style={{ color: "var(--color-black)" }}>{s.descrizioneFasi}</div>
              </div>
            )}
          </section>

          {s.pdfAllegato.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-[12.1px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>PDF allegati</h3>
              <div className="flex flex-col gap-1.5">
                {s.pdfAllegato.map((pdf, i) => (
                  <a key={i} href={pdf.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-[15.4px] font-medium transition-colors hover:opacity-80"
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

          </>}

        </div>
      </div>

      {showEditForm && (
        <FormModificaScheda
          scheda={s}
          onClose={() => setShowEditForm(false)}
          onSave={(updated) => {
            setShowEditForm(false);
            onSchedaAggiornata?.(updated);
          }}
        />
      )}

      {showNuovaSottoscheda && (
        <FormNuovaSottoscheda
          schedaPadre={s}
          onClose={() => setShowNuovaSottoscheda(false)}
          onCreated={handleSottoschedaCreata}
        />
      )}
    </div>
  );
}
