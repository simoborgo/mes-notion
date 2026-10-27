"use client";

import { useEffect, useRef, useState } from "react";
import type { Scheda } from "@/lib/types";

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface Props {
  scheda: Scheda;
  canEdit: boolean;
  onClose: () => void;
  onAggiornata: (updated: Scheda) => void;
}

// Piccolo modale per gestire gli Ordini Fornitore (PDF) di una scheda direttamente dalla tabella
// Lavorazioni Esterne: trascinamento dei file sull'area, oppure clic per sceglierli.
export default function ModaleOrdineFornitore({ scheda, canEdit, onClose, onAggiornata }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [trascinando, setTrascinando] = useState(false);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [rimuovendo, setRimuovendo] = useState<string | null>(null);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function carica(files: File[]) {
    const pdf = files.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (pdf.length < files.length) setErrore("Sono accettati solo file PDF.");
    else setErrore("");
    for (const file of pdf) {
      setInCorso(file.name);
      try {
        const pdfBase64 = await readAsBase64(file);
        const res = await fetch(`/api/schede/${scheda.id}/ordine-fornitore`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pdfBase64, filename: file.name }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Errore caricamento Ordine Fornitore");
        onAggiornata(data as Scheda);
      } catch (e) {
        setErrore(e instanceof Error ? e.message : "Errore caricamento Ordine Fornitore");
        break;
      }
    }
    setInCorso(null);
  }

  async function rimuovi(fileId: string) {
    if (!confirm("Eliminare questo Ordine Fornitore?")) return;
    setRimuovendo(fileId);
    setErrore("");
    try {
      const res = await fetch(`/api/schede/${scheda.id}/ordine-fornitore/${fileId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore eliminazione Ordine Fornitore");
      onAggiornata(data as Scheda);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore eliminazione Ordine Fornitore");
    } finally {
      setRimuovendo(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold">Ordine Fornitore</h2>
            <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
              {scheda.odp || "—"}{scheda.fornitore ? ` · ${scheda.fornitore}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="text-lg leading-none" style={{ color: "var(--color-grey-mid)" }}>✕</button>
        </div>

        {scheda.pdfOrdineFornitore.length > 0 ? (
          <ul className="flex flex-col gap-1.5 mb-3">
            {scheda.pdfOrdineFornitore.map((pdf, i) => (
              <li key={pdf.id ?? i} className="flex items-center gap-2">
                <a href={pdf.url} target="_blank" rel="noopener noreferrer"
                  className="flex-1 min-w-0 truncate px-3 py-2 rounded-lg border text-base font-medium hover:opacity-80"
                  style={{ borderColor: "#c7d2fe", color: "#4338ca", background: "#eef2ff" }} title={pdf.name}>
                  📄 {pdf.name || "Ordine Fornitore"}
                </a>
                {canEdit && pdf.id && (
                  <button type="button" onClick={() => rimuovi(pdf.id!)} disabled={rimuovendo === pdf.id} title="Elimina"
                    className="shrink-0 text-base disabled:opacity-50" style={{ color: "var(--color-grey-mid)" }}>✕</button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm mb-3" style={{ color: "var(--color-grey-mid)" }}>Nessun Ordine Fornitore caricato.</p>
        )}

        {canEdit && (
          <>
            <input ref={inputRef} type="file" accept="application/pdf" multiple className="hidden"
              onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void carica(f); }} />
            <div
              role="button" tabIndex={0}
              onClick={() => !inCorso && inputRef.current?.click()}
              onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !inCorso) inputRef.current?.click(); }}
              onDragOver={(e) => { e.preventDefault(); setTrascinando(true); }}
              onDragLeave={() => setTrascinando(false)}
              onDrop={(e) => { e.preventDefault(); setTrascinando(false); if (!inCorso) void carica(Array.from(e.dataTransfer.files)); }}
              className="rounded-xl px-4 py-8 text-center text-base cursor-pointer transition-colors"
              style={{
                border: `2px dashed ${trascinando ? "var(--color-primary)" : "#d6d3cd"}`,
                background: trascinando ? "rgba(240,143,37,0.08)" : "#FAFAF9",
                color: "var(--color-grey-mid)",
              }}
            >
              {inCorso ? `Carico ${inCorso}…` : trascinando ? "Rilascia qui il PDF" : "Trascina qui il PDF dell'ordine, oppure clicca per sceglierlo"}
            </div>
          </>
        )}
        {errore && <p className="text-sm mt-2" style={{ color: "#DC2626" }}>{errore}</p>}
      </div>
    </div>
  );
}
