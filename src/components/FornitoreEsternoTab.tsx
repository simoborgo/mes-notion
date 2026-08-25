"use client";

import { useEffect, useRef, useState } from "react";
import type { Scheda } from "@/lib/types";
import { MODIFICA_SCHEDA_ROLES, type Role } from "@/lib/roles";
import BadgeStato from "./BadgeStato";

interface Fornitore { id: string; nome: string }

const STATI_ESTERNI = ["Da Ordinare", "Da Inviare", "In Lavorazione", "Rientrato", "In attesa Preventivo", "Fornitore in attesa materiale"];

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

function Mancante() {
  return <span className="font-bold px-1.5 py-0.5 rounded" style={{ background: "#FEF3C7", color: "#92400E" }}>MANCANTE</span>;
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "#f8f7f5", border: "1px solid #ebe9e5" }}>
      <div className="text-[12.1px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9c9894" }}>{label}</div>
      {children}
    </div>
  );
}

interface Props {
  scheda: Scheda;
  userRole?: Role;
  onSchedaAggiornata?: (updated: Scheda) => void;
}

export default function FornitoreEsternoTab({ scheda, userRole, onSchedaAggiornata }: Props) {
  const canEdit = !!userRole && MODIFICA_SCHEDA_ROLES.includes(userRole);
  const [schedaLive, setSchedaLive] = useState(scheda);

  // Niente più checkbox manuale "Produzione Esterna": la sezione si abilita da sola quando lo
  // Stato Produzione è "In lavorazione Esterna" (impostabile dal form "Modifica"), oppure resta
  // visibile se la scheda ha già dati di produzione esterna da quando lo era in passato.
  const isEsterna = scheda.statoProduzione === "In lavorazione Esterna" || scheda.produzioneEsterna;

  const [form, setForm] = useState({
    fornitoreId: scheda.fornitoreId,
    statoProdEsterna: scheda.statoProdEsterna,
    dataUscitaMateriale: scheda.dataUscitaMateriale ?? "",
    dataRientroPrevista: scheda.dataRientroPrevista ?? "",
    dataRientroEffettiva: scheda.dataRientroEffettiva ?? "",
  });
  const [initialForm, setInitialForm] = useState(form);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  useEffect(() => {
    if (!canEdit) return;
    fetch("/api/fornitori").then(r => r.json()).then(setFornitori).catch(() => {});
  }, [canEdit]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/schede/${scheda.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          dataUscitaMateriale: form.dataUscitaMateriale || null,
          dataRientroPrevista: form.dataRientroPrevista || null,
          dataRientroEffettiva: form.dataRientroEffettiva || null,
        }),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      const updated: Scheda = await res.json();
      setSchedaLive(updated);
      setInitialForm(form);
      onSchedaAggiornata?.(updated);
    } catch {
      setError("Errore durante il salvataggio. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  const [uploadingOrdineFornitore, setUploadingOrdineFornitore] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const ordineFornitoreInputRef = useRef<HTMLInputElement>(null);

  async function handleOrdineFornitoreUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingOrdineFornitore(true);
    setUploadError("");
    try {
      const pdfBase64 = await readAsBase64(file);
      const res = await fetch(`/api/schede/${scheda.id}/ordine-fornitore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64, filename: file.name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore caricamento Ordine Fornitore");
      setSchedaLive(data as Scheda);
      onSchedaAggiornata?.(data as Scheda);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore caricamento Ordine Fornitore");
    } finally {
      setUploadingOrdineFornitore(false);
    }
  }

  async function handleRemoveOrdineFornitore(fileId: string) {
    if (!confirm("Eliminare questo Ordine Fornitore?")) return;
    setRemovingId(fileId);
    setUploadError("");
    try {
      const res = await fetch(`/api/schede/${scheda.id}/ordine-fornitore/${fileId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore eliminazione Ordine Fornitore");
      setSchedaLive(data as Scheda);
      onSchedaAggiornata?.(data as Scheda);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore eliminazione Ordine Fornitore");
    } finally {
      setRemovingId(null);
    }
  }

  const inputCls = "w-full text-[15.4px] px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-orange-300 transition-shadow";
  const inputStyle = { border: "1px solid #e5e4e0", background: "white", color: "var(--color-black)" };

  const OrdineFornitoreCard = (
    <Card label="Ordine Fornitore">
      <div className="flex flex-col gap-1.5 mb-2">
        {schedaLive.pdfOrdineFornitore.length > 0 ? schedaLive.pdfOrdineFornitore.map((pdf, i) => (
          <div key={pdf.id ?? i} className="flex items-center gap-1.5">
            <a href={pdf.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-[15.4px] font-medium transition-colors hover:opacity-80 flex-1 min-w-0"
              style={{ borderColor: "#c7d2fe", color: "#4338ca", background: "#eef2ff" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
              </svg>
              <span className="truncate">{pdf.name || `Ordine Fornitore ${i > 0 ? i + 1 : ""}`}</span>
            </a>
            {canEdit && pdf.id && (
              <button type="button" onClick={() => handleRemoveOrdineFornitore(pdf.id!)} disabled={removingId === pdf.id}
                title="Elimina" className="shrink-0 text-[15.4px] leading-none disabled:opacity-50" style={{ color: "var(--color-grey-mid)" }}>
                ✕
              </button>
            )}
          </div>
        )) : <Mancante />}
      </div>
      {canEdit && (
        <>
          <input ref={ordineFornitoreInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleOrdineFornitoreUpload} />
          <button type="button" onClick={() => ordineFornitoreInputRef.current?.click()} disabled={uploadingOrdineFornitore}
            className="text-[13.2px] px-3 py-1.5 rounded-lg font-semibold border transition-colors disabled:opacity-50"
            style={{ color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.3)", background: "rgba(240,143,37,0.06)" }}>
            {uploadingOrdineFornitore ? "Carico…" : "+ Aggiungi Ordine Fornitore"}
          </button>
          {uploadError && <p className="text-[13.2px] mt-1.5" style={{ color: "#DC2626" }}>{uploadError}</p>}
        </>
      )}
    </Card>
  );

  if (!canEdit) {
    const today = new Date().toISOString().slice(0, 10);
    const inLavorazione = !["Completato", "Annullata"].includes(scheda.statoProduzione);
    const inRitardoRientro = inLavorazione && scheda.produzioneEsterna && !!scheda.dataRientroPrevista && scheda.dataRientroPrevista < today;
    return (
      <section className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Card label="Fornitore">{scheda.fornitore || <Mancante />}</Card>
          <Card label="Stato Produzione Esterna">{scheda.statoProdEsterna ? <BadgeStato stato={scheda.statoProdEsterna} /> : <Mancante />}</Card>
          <Card label="Uscita materiale">{fmt(scheda.dataUscitaMateriale)}</Card>
          <Card label="Rientro previsto">
            {scheda.dataRientroPrevista
              ? <span style={inRitardoRientro ? { color: "#991B1B", fontWeight: 700 } : undefined}>{fmt(scheda.dataRientroPrevista)}</span>
              : <Mancante />}
          </Card>
          <Card label="Rientro effettivo">{fmt(scheda.dataRientroEffettiva)}</Card>
        </div>
        {isEsterna && OrdineFornitoreCard}
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {!isEsterna && (
        <p className="text-[13.2px] rounded-lg px-3 py-2" style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }}>
          Questa sezione si attiva automaticamente quando lo Stato Produzione è &quot;In lavorazione Esterna&quot; — impostalo da &quot;Modifica&quot; nella tab Info.
        </p>
      )}

      {isEsterna && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Card label="Fornitore">
            <select className={inputCls} style={inputStyle} value={form.fornitoreId ?? ""} onChange={(e) => set("fornitoreId", e.target.value || null)}>
              <option value="">— nessuno —</option>
              {fornitori.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Card>
          <Card label="Stato Produzione Esterna">
            <select className={inputCls} style={inputStyle} value={form.statoProdEsterna} onChange={(e) => set("statoProdEsterna", e.target.value)}>
              <option value="">— nessuno —</option>
              {STATI_ESTERNI.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Card>
          <Card label="Uscita materiale">
            <input type="date" className={inputCls} style={inputStyle} value={form.dataUscitaMateriale} onChange={(e) => set("dataUscitaMateriale", e.target.value)} />
          </Card>
          <Card label="Rientro previsto">
            <input type="date" className={inputCls} style={inputStyle} value={form.dataRientroPrevista} onChange={(e) => set("dataRientroPrevista", e.target.value)} />
          </Card>
          <Card label="Rientro effettivo">
            <input type="date" className={inputCls} style={inputStyle} value={form.dataRientroEffettiva} onChange={(e) => set("dataRientroEffettiva", e.target.value)} />
          </Card>
        </div>
      )}

      {error && <p className="text-[13.2px] font-medium" style={{ color: "#DC2626" }}>{error}</p>}

      <div className="flex justify-end">
        <button type="button" onClick={handleSave} disabled={!isDirty || saving}
          className="text-[15.4px] px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: "var(--color-primary)", color: "white" }}>
          {saving ? "Salvataggio…" : "Salva modifiche"}
        </button>
      </div>

      {isEsterna && OrdineFornitoreCard}
    </section>
  );
}
