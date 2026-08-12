"use client";

import { useEffect, useRef, useState } from "react";
import type { Scheda, SchedaUpdate } from "@/lib/types";

interface Fornitore { id: string; nome: string }

const STATI = [
  "Da Iniziare",
  "In lavorazione",
  "In lavorazione Esterna",
  "Materiale Pronto",
  "Verificato",
  "Completato",
  "In Attesa Rilavorazione",
  "In attesa materiale",
  "Produzione Bloccata",
  "Annullata",
  "Revisione UTT",
];

const STATI_ESTERNI = ["Da Ordinare", "Da Inviare", "In Lavorazione", "Rientrato", "In attesa Preventivo", "Fornitore in attesa materiale"];

interface Props {
  scheda: Scheda;
  onClose: () => void;
  onSave: (updated: Scheda) => void;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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

function AllegatoSection({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "#e5e4e0" }}>
      <p className="text-xs font-semibold" style={{ color: "var(--color-grey-mid)" }}>{titolo}</p>
      {children}
    </div>
  );
}

export default function FormModificaScheda({ scheda, onClose, onSave }: Props) {
  const [schedaLive, setSchedaLive] = useState(scheda);
  const [form, setForm] = useState<SchedaUpdate>({
    statoProduzione: scheda.statoProduzione,
    dataProduzionePrevista: scheda.dataProduzionePrevista ?? "",
    produzioneEsterna: scheda.produzioneEsterna,
    statoProdEsterna: scheda.statoProdEsterna,
    fornitoreId: scheda.fornitoreId,
    dataRientroPrevista: scheda.dataRientroPrevista ?? "",
    dataUscitaMateriale: scheda.dataUscitaMateriale ?? "",
    dataRientroEffettiva: scheda.dataRientroEffettiva ?? "",
    note: scheda.note,
    codiceArticolo: scheda.codiceArticolo,
    posizione: scheda.posizione,
    quantita: scheda.quantita,
    noteStato: scheda.noteStato,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  useEffect(() => {
    fetch("/api/fornitori").then(r => r.json()).then(setFornitori).catch(() => {});
  }, []);

  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [uploadingCopertina, setUploadingCopertina] = useState(false);
  const [uploadingOrdineFornitore, setUploadingOrdineFornitore] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const copertinaInputRef = useRef<HTMLInputElement>(null);
  const ordineFornitoreInputRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof SchedaUpdate>(k: K, v: SchedaUpdate[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload: SchedaUpdate = {
        ...form,
        dataProduzionePrevista: form.dataProduzionePrevista || null,
        dataRientroPrevista: form.dataRientroPrevista || null,
        dataUscitaMateriale: form.dataUscitaMateriale || null,
        dataRientroEffettiva: form.dataRientroEffettiva || null,
      };
      const res = await fetch(`/api/schede/${scheda.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      const updated: Scheda = await res.json();
      onSave(updated);
    } catch {
      setError("Errore durante il salvataggio. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPdf(true);
    setUploadError("");
    try {
      const pdfBase64 = await readAsBase64(file);
      const res = await fetch(`/api/schede/${scheda.id}/pdf-allegato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64, filename: file.name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore caricamento PDF");
      setSchedaLive(data as Scheda);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore caricamento PDF");
    } finally {
      setUploadingPdf(false);
    }
  }

  async function handleFotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setUploadingFoto(true);
    setUploadError("");
    try {
      const fotoBase64 = await Promise.all(files.map(f => compressPhoto(f)));
      const res = await fetch(`/api/schede/${scheda.id}/foto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fotoBase64 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore caricamento foto");
      setSchedaLive(data as Scheda);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore caricamento foto");
    } finally {
      setUploadingFoto(false);
    }
  }

  async function handleCopertinaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingCopertina(true);
    setUploadError("");
    try {
      const imageBase64 = await compressPhoto(file);
      const res = await fetch(`/api/schede/${scheda.id}/copertina`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, filename: file.name.replace(/\.[^.]+$/, "") + ".jpg" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore caricamento copertina");
      setSchedaLive(data as Scheda);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore caricamento copertina");
    } finally {
      setUploadingCopertina(false);
    }
  }

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
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore caricamento Ordine Fornitore");
    } finally {
      setUploadingOrdineFornitore(false);
    }
  }

  const inputCls = "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300";
  const labelCls = "block text-xs font-medium mb-1";
  const uploadBtnCls = "text-xs px-3 py-1.5 rounded-lg font-semibold border transition-colors disabled:opacity-50";
  const uploadBtnStyle = { color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.3)", background: "rgba(240,143,37,0.06)" };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]"
        style={{ borderRadius: "var(--radius-modal)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-base">Modifica Scheda</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
              {scheda.odp} — {scheda.numeroScheda}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Codice Articolo</label>
              <input type="text" className={inputCls} value={form.codiceArticolo ?? ""} onChange={(e) => set("codiceArticolo", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Posizione</label>
              <input type="text" className={inputCls} value={form.posizione ?? ""} onChange={(e) => set("posizione", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Quantità</label>
              <input type="number" min="0" className={inputCls} value={form.quantita ?? ""} onChange={(e) => set("quantita", e.target.value === "" ? null : Number(e.target.value))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Stato Produzione</label>
              <select className={inputCls} value={form.statoProduzione} onChange={(e) => set("statoProduzione", e.target.value)}>
                <option value="">— nessuno —</option>
                {STATI.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Produzione Prevista</label>
              <input type="date" className={inputCls} value={form.dataProduzionePrevista ?? ""} onChange={(e) => set("dataProduzionePrevista", e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="esterna"
              type="checkbox"
              checked={form.produzioneEsterna}
              onChange={(e) => set("produzioneEsterna", e.target.checked)}
              className="w-4 h-4 accent-orange-500"
            />
            <label htmlFor="esterna" className="text-sm font-medium">Produzione Esterna</label>
          </div>

          {form.produzioneEsterna && (
            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg border" style={{ background: "#faf9f7" }}>
              <div>
                <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Fornitore</label>
                <select className={inputCls} value={form.fornitoreId ?? ""} onChange={(e) => set("fornitoreId", e.target.value || null)}>
                  <option value="">— nessuno —</option>
                  {fornitori.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Stato Produzione Esterna</label>
                <select className={inputCls} value={form.statoProdEsterna} onChange={(e) => set("statoProdEsterna", e.target.value)}>
                  <option value="">— nessuno —</option>
                  {STATI_ESTERNI.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Uscita Materiale</label>
                <input type="date" className={inputCls} value={form.dataUscitaMateriale ?? ""} onChange={(e) => set("dataUscitaMateriale", e.target.value)} />
              </div>
              <div>
                <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Rientro Prevista</label>
                <input type="date" className={inputCls} value={form.dataRientroPrevista ?? ""} onChange={(e) => set("dataRientroPrevista", e.target.value)} />
              </div>
              <div>
                <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Data Rientro Effettiva</label>
                <input type="date" className={inputCls} value={form.dataRientroEffettiva ?? ""} onChange={(e) => set("dataRientroEffettiva", e.target.value)} />
              </div>
              <div className="col-span-2">
                <AllegatoSection titolo={`Ordine Fornitore (${schedaLive.pdfOrdineFornitore.length})`}>
                  <div className="flex flex-col gap-1">
                    {schedaLive.pdfOrdineFornitore.map((pdf, i) => (
                      <a key={i} href={pdf.url} target="_blank" rel="noreferrer" className="text-xs underline truncate" style={{ color: "#DC2626" }}>
                        {pdf.name || `Ordine Fornitore ${i + 1}`}
                      </a>
                    ))}
                  </div>
                  <input ref={ordineFornitoreInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleOrdineFornitoreUpload} />
                  <button type="button" onClick={() => ordineFornitoreInputRef.current?.click()} disabled={uploadingOrdineFornitore} className={uploadBtnCls} style={uploadBtnStyle}>
                    {uploadingOrdineFornitore ? "Carico…" : "+ Aggiungi Ordine Fornitore"}
                  </button>
                </AllegatoSection>
              </div>
            </div>
          )}

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Note Stato</label>
            <textarea rows={2} className={inputCls + " resize-none"} value={form.noteStato ?? ""} onChange={(e) => set("noteStato", e.target.value)} />
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--color-grey-mid)" }}>Note</label>
            <textarea rows={3} className={inputCls + " resize-none"} value={form.note} onChange={(e) => set("note", e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <AllegatoSection titolo={`PDF Allegato (${schedaLive.pdfAllegato.length})`}>
              <div className="flex flex-col gap-1">
                {schedaLive.pdfAllegato.map((pdf, i) => (
                  <a key={i} href={pdf.url} target="_blank" rel="noreferrer" className="text-xs underline truncate" style={{ color: "#DC2626" }}>
                    {pdf.name || `PDF ${i + 1}`}
                  </a>
                ))}
              </div>
              <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} />
              <button type="button" onClick={() => pdfInputRef.current?.click()} disabled={uploadingPdf} className={uploadBtnCls} style={uploadBtnStyle}>
                {uploadingPdf ? "Carico…" : "+ Aggiungi PDF"}
              </button>
            </AllegatoSection>

            <AllegatoSection titolo={`Foto (${schedaLive.foto.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {schedaLive.foto.map((f, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={f.url} alt="" className="w-12 h-12 object-cover rounded border" style={{ borderColor: "#e5e4e0" }} />
                ))}
              </div>
              <input ref={fotoInputRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handleFotoUpload} />
              <button type="button" onClick={() => fotoInputRef.current?.click()} disabled={uploadingFoto} className={uploadBtnCls} style={uploadBtnStyle}>
                {uploadingFoto ? "Carico…" : "+ Aggiungi foto"}
              </button>
            </AllegatoSection>

            <AllegatoSection titolo="Copertina">
              {schedaLive.copertina && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={schedaLive.copertina} alt="Copertina" className="w-full h-16 object-cover rounded border" style={{ borderColor: "#e5e4e0" }} />
              )}
              <input ref={copertinaInputRef} type="file" accept="image/*" className="hidden" onChange={handleCopertinaUpload} />
              <button type="button" onClick={() => copertinaInputRef.current?.click()} disabled={uploadingCopertina} className={uploadBtnCls} style={uploadBtnStyle}>
                {uploadingCopertina ? "Carico…" : schedaLive.copertina ? "Sostituisci" : "+ Carica copertina"}
              </button>
            </AllegatoSection>
          </div>
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

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
