"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Vernice } from "@/lib/types";

function etichetta(v: Vernice): string {
  const parti = [v.coloreCodice || v.coloreNome, v.famigliaProdotto, v.codiceInventario ? `#${v.codiceInventario}` : null];
  return parti.filter(Boolean).join(" · ");
}

// Combobox minimale con ricerca client-side: niente libreria (coerente col resto del MES, che
// non ha componenti combobox condivisi) — input di testo + lista filtrata sotto, click per
// selezionare. Il catalogo vernici è ~600 righe: un <select> nativo sarebbe usabile ma senza
// ricerca full-text sarebbe scomodo da usare in produzione (colore_codice/famiglia_prodotto).
//
// Il dropdown è position:fixed (non absolute) con coordinate calcolate da getBoundingClientRect():
// dentro il modal CicloModal l'elemento vive in un contenitore overflow-y-auto, che con
// position:absolute tagliava/rimpiccioliva la lista rendendola inutilizzabile — fixed esce dal
// clipping degli antenati con overflow (non essendoci transform/filter tra l'input e il viewport).
export default function VerniceSelect({
  vernici,
  value,
  onChange,
  placeholder = "Cerca vernice per colore, famiglia, codice…",
}: {
  vernici: Vernice[];
  value: string | null;
  onChange: (verniceId: string | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selezionata = useMemo(() => vernici.find((v) => v.id === value) ?? null, [vernici, value]);

  const risultati = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vernici.slice(0, 30);
    return vernici.filter((v) => etichetta(v).toLowerCase().includes(q)).slice(0, 30);
  }, [vernici, query]);

  function apri() {
    const rect = (wrapperRef.current ?? inputRef.current)?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function riposiziona() {
      const rect = (wrapperRef.current ?? inputRef.current)?.getBoundingClientRect();
      if (rect) setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    window.addEventListener("scroll", riposiziona, true);
    window.addEventListener("resize", riposiziona);
    return () => {
      window.removeEventListener("scroll", riposiziona, true);
      window.removeEventListener("resize", riposiziona);
    };
  }, [open]);

  if (selezionata && !open) {
    return (
      <div ref={wrapperRef} className="flex items-center gap-2 border rounded px-2 py-1 text-sm bg-white" style={{ borderColor: "#d1d5db" }}>
        <span className="flex-1">{etichetta(selezionata)}</span>
        <button
          type="button"
          onClick={() => { onChange(null); setQuery(""); apri(); }}
          className="text-gray-400 hover:text-gray-600 text-sm leading-none"
          title="Cambia vernice"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        className="w-full border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
        style={{ borderColor: "#d1d5db" }}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={apri}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && coords && (
        <div
          className="fixed z-[100] max-h-56 overflow-y-auto rounded-lg border bg-white shadow-lg"
          style={{ top: coords.top, left: coords.left, width: coords.width, borderColor: "#E4E0DA" }}
        >
          {risultati.length === 0 ? (
            <div className="px-3 py-2 text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessuna vernice trovata</div>
          ) : (
            risultati.map((v) => (
              <button
                key={v.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(v.id); setQuery(""); setOpen(false); }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-orange-50 border-b last:border-0"
                style={{ borderColor: "#F3F1ED" }}
              >
                {etichetta(v)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
