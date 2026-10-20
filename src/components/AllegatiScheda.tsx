"use client";

import { useRef, useState } from "react";
import type { Scheda } from "@/lib/types";

// Allegati della scheda (PDF, foto, copertina, altri file) con caricamento ed eliminazione
// immediati: ogni operazione è una chiamata API a sé, non passa dal "Salva" del form che li
// contiene. Condiviso tra il modale di modifica (FormModificaScheda) e l'editor a pagina piena.

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

// Box con drag & drop: i file trascinati vengono filtrati con `accept` (es. solo PDF o solo immagini)
// e passati a `onFiles`; senza `onFiles` resta un semplice contenitore.
function AllegatoSection({ titolo, children, onFiles, accept }: {
  titolo: string;
  children: React.ReactNode;
  onFiles?: (files: File[]) => void;
  accept?: (f: File) => boolean;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className="space-y-2 rounded-lg border p-3 transition-colors"
      style={{
        borderColor: dragging ? "var(--color-primary)" : "#e5e4e0",
        background: dragging ? "#fafaf9" : undefined,
        borderStyle: dragging ? "dashed" : "solid",
      }}
      onDragOver={onFiles ? (e) => { e.preventDefault(); setDragging(true); } : undefined}
      onDragLeave={onFiles ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); } : undefined}
      onDrop={onFiles ? (e) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files).filter(accept ?? (() => true));
        if (files.length) onFiles(files);
      } : undefined}
    >
      <p className="text-xs font-semibold" style={{ color: "var(--color-grey-mid)" }}>{titolo}</p>
      {children}
      {onFiles && <p className="text-[10px]" style={{ color: "var(--color-grey-mid)" }}>…oppure trascina qui i file</p>}
    </div>
  );
}

const isPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
const isImage = (f: File) => f.type.startsWith("image/");

export default function AllegatiScheda({ scheda, onAggiornata }: {
  scheda: Scheda;
  onAggiornata?: (s: Scheda) => void; // ogni volta che un caricamento/eliminazione riesce
}) {
  const [schedaLive, setSchedaLive] = useState(scheda);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [uploadingCopertina, setUploadingCopertina] = useState(false);
  const [uploadingAllegato, setUploadingAllegato] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const copertinaInputRef = useRef<HTMLInputElement>(null);
  const allegatoInputRef = useRef<HTMLInputElement>(null);

  function aggiorna(s: Scheda) {
    setSchedaLive(s);
    onAggiornata?.(s);
  }

  function pickFiles(e: React.ChangeEvent<HTMLInputElement>): File[] {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    return files;
  }

  const json = { "Content-Type": "application/json" };

  async function uploadPdf(files: File[]) {
    if (!files.length) return;
    setUploadingPdf(true);
    setUploadError("");
    try {
      // In sequenza: l'ordine successivo viene calcolato lato server sul MAX corrente.
      for (const file of files) {
        const pdfBase64 = await readAsBase64(file);
        const res = await fetch(`/api/schede/${scheda.id}/pdf-allegato`, { method: "POST", headers: json, body: JSON.stringify({ pdfBase64, filename: file.name }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Errore caricamento PDF");
        aggiorna(data as Scheda);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore caricamento PDF");
    } finally {
      setUploadingPdf(false);
    }
  }

  async function uploadFoto(files: File[]) {
    if (!files.length) return;
    setUploadingFoto(true);
    setUploadError("");
    try {
      const fotoBase64 = await Promise.all(files.map(f => compressPhoto(f)));
      const res = await fetch(`/api/schede/${scheda.id}/foto`, { method: "POST", headers: json, body: JSON.stringify({ fotoBase64 }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore caricamento foto");
      aggiorna(data as Scheda);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore caricamento foto");
    } finally {
      setUploadingFoto(false);
    }
  }

  async function uploadAllegati(files: File[]) {
    if (!files.length) return;
    setUploadingAllegato(true);
    setUploadError("");
    try {
      // In sequenza (non in parallelo): ogni upload calcola l'ordine successivo lato server
      // leggendo il MAX corrente, richieste parallele potrebbero leggere lo stesso valore.
      for (const file of files) {
        const fileBase64 = await readAsBase64(file);
        const res = await fetch(`/api/schede/${scheda.id}/allegati`, { method: "POST", headers: json, body: JSON.stringify({ fileBase64, filename: file.name }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Errore caricamento allegato");
        aggiorna(data as Scheda);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore caricamento allegato");
    } finally {
      setUploadingAllegato(false);
    }
  }

  async function uploadCopertina(files: File[]) {
    const file = files[0];
    if (!file) return;
    setUploadingCopertina(true);
    setUploadError("");
    try {
      const imageBase64 = await compressPhoto(file);
      const res = await fetch(`/api/schede/${scheda.id}/copertina`, {
        method: "POST", headers: json, body: JSON.stringify({ imageBase64, filename: file.name.replace(/\.[^.]+$/, "") + ".jpg" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore caricamento copertina");
      aggiorna(data as Scheda);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore caricamento copertina");
    } finally {
      setUploadingCopertina(false);
    }
  }

  async function elimina(chiave: string, conferma: string, url: string, errore: string) {
    if (!confirm(conferma)) return;
    setRemovingId(chiave);
    setUploadError("");
    try {
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? errore);
      aggiorna(data as Scheda);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : errore);
    } finally {
      setRemovingId(null);
    }
  }

  const uploadBtnCls = "text-xs px-3 py-1.5 rounded-lg font-semibold border transition-colors disabled:opacity-50";
  const uploadBtnStyle = { color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.3)", background: "rgba(240,143,37,0.06)" };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <AllegatoSection titolo={`PDF Allegato (${schedaLive.pdfAllegato.length})`} onFiles={uploadPdf} accept={isPdf}>
          <div className="flex flex-col gap-1">
            {schedaLive.pdfAllegato.map((pdf, i) => (
              <div key={pdf.id ?? i} className="flex items-center gap-1.5">
                <a href={pdf.url} target="_blank" rel="noreferrer" className="text-xs underline truncate flex-1" style={{ color: "#DC2626" }}>
                  {pdf.name || `PDF ${i + 1}`}
                </a>
                {pdf.id && (
                  <button type="button" onClick={() => elimina(pdf.id!, "Eliminare questo PDF?", `/api/schede/${scheda.id}/pdf-allegato/${pdf.id}`, "Errore eliminazione PDF")} disabled={removingId === pdf.id}
                    title="Elimina" className="shrink-0 text-xs leading-none disabled:opacity-50" style={{ color: "var(--color-grey-mid)" }}>
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <input ref={pdfInputRef} type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => uploadPdf(pickFiles(e))} />
          <button type="button" onClick={() => pdfInputRef.current?.click()} disabled={uploadingPdf} className={uploadBtnCls} style={uploadBtnStyle}>
            {uploadingPdf ? "Carico…" : "+ Aggiungi PDF"}
          </button>
        </AllegatoSection>

        <AllegatoSection titolo={`Foto (${schedaLive.foto.length})`} onFiles={uploadFoto} accept={isImage}>
          <div className="flex flex-wrap gap-1.5">
            {schedaLive.foto.map((f, i) => (
              <div key={f.id ?? i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="" className="w-12 h-12 object-cover rounded border" style={{ borderColor: "#e5e4e0" }} />
                {f.id && (
                  <button type="button" onClick={() => elimina(f.id!, "Eliminare questa foto?", `/api/schede/${scheda.id}/foto/${f.id}`, "Errore eliminazione foto")} disabled={removingId === f.id}
                    title="Elimina" className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[10px] flex items-center justify-center disabled:opacity-50"
                    style={{ background: "#991B1B", color: "white" }}>
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <input ref={fotoInputRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={(e) => uploadFoto(pickFiles(e))} />
          <button type="button" onClick={() => fotoInputRef.current?.click()} disabled={uploadingFoto} className={uploadBtnCls} style={uploadBtnStyle}>
            {uploadingFoto ? "Carico…" : "+ Aggiungi foto"}
          </button>
        </AllegatoSection>

        <AllegatoSection titolo="Copertina" onFiles={uploadCopertina} accept={isImage}>
          {schedaLive.copertina && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={schedaLive.copertina} alt="Copertina" className="w-full h-16 object-cover rounded border" style={{ borderColor: "#e5e4e0" }} />
          )}
          <div className="flex gap-2">
            <input ref={copertinaInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadCopertina(pickFiles(e))} />
            <button type="button" onClick={() => copertinaInputRef.current?.click()} disabled={uploadingCopertina} className={uploadBtnCls} style={uploadBtnStyle}>
              {uploadingCopertina ? "Carico…" : schedaLive.copertina ? "Sostituisci" : "+ Carica copertina"}
            </button>
            {schedaLive.copertina && (
              <button type="button" onClick={() => elimina("copertina", "Eliminare la copertina?", `/api/schede/${scheda.id}/copertina`, "Errore eliminazione copertina")} disabled={removingId === "copertina"}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold border transition-colors disabled:opacity-50"
                style={{ color: "#DC2626", borderColor: "#fecaca", background: "#FFF5F5" }}>
                {removingId === "copertina" ? "Elimino…" : "Elimina"}
              </button>
            )}
          </div>
        </AllegatoSection>

        <AllegatoSection titolo={`Allegati (${schedaLive.allegati.length})`} onFiles={uploadAllegati}>
          <div className="flex flex-col gap-1">
            {schedaLive.allegati.map((f) => (
              <div key={f.id} className="flex items-center gap-1.5">
                <a href={f.url} target="_blank" rel="noreferrer" className="text-xs underline truncate flex-1" style={{ color: "#DC2626" }}>
                  {f.name}
                </a>
                <button type="button" onClick={() => elimina(f.id, "Eliminare questo allegato?", `/api/schede/${scheda.id}/allegati/${f.id}`, "Errore eliminazione allegato")} disabled={removingId === f.id}
                  title="Elimina" className="shrink-0 text-xs leading-none disabled:opacity-50" style={{ color: "var(--color-grey-mid)" }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <input ref={allegatoInputRef} type="file" multiple className="hidden" onChange={(e) => uploadAllegati(pickFiles(e))} />
          <button type="button" onClick={() => allegatoInputRef.current?.click()} disabled={uploadingAllegato} className={uploadBtnCls} style={uploadBtnStyle}>
            {uploadingAllegato ? "Carico…" : "+ Aggiungi file"}
          </button>
        </AllegatoSection>
      </div>
      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
    </div>
  );
}
