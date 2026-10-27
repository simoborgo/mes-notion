"use client";

import { useEffect } from "react";
import type { Scheda } from "@/lib/types";

interface Props {
  scheda: Scheda;
  onClose: () => void;
  onApri: (scheda: Scheda) => void;
}

// Anteprima rapida di una scheda (copertina + PDF allegati) per riconoscerla senza aprirla per intero.
export default function ModaleAnteprimaScheda({ scheda, onClose, onApri }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold font-mono truncate">{scheda.odp || "—"}{scheda.numeroScheda ? ` - ${scheda.numeroScheda}` : ""}</h2>
            <p className="text-base truncate" style={{ color: "var(--color-grey-mid)" }}>
              {[scheda.commessaNr, scheda.clienteInfo].filter(Boolean).join(" - ")}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="text-lg leading-none" style={{ color: "var(--color-grey-mid)" }}>✕</button>
        </div>

        {scheda.copertina ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={scheda.copertina} alt="Copertina scheda" className="w-full rounded-lg border object-contain bg-neutral-50" style={{ borderColor: "#e5e4e0", maxHeight: "60vh" }} />
        ) : (
          <div className="rounded-lg px-4 py-10 text-center text-base" style={{ border: "1px dashed #d6d3cd", color: "var(--color-grey-mid)" }}>
            Nessuna copertina disponibile
          </div>
        )}

        {scheda.pdfAllegato.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-3">
            {scheda.pdfAllegato.map((pdf, i) => (
              <a key={pdf.id ?? i} href={pdf.url} target="_blank" rel="noopener noreferrer"
                className="truncate px-3 py-2 rounded-lg border text-base font-medium hover:opacity-80"
                style={{ borderColor: "#c7d2fe", color: "#4338ca", background: "#eef2ff" }}>
                📄 {pdf.name || "PDF scheda"}
              </a>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button type="button" onClick={() => onApri(scheda)}
            className="text-base px-4 py-2 rounded-lg font-semibold"
            style={{ background: "var(--color-primary)", color: "white" }}>
            Apri scheda
          </button>
        </div>
      </div>
    </div>
  );
}
