"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

// Una voce dell'indice di ricerca: costruito lato server dai dati già caricati della scheda, la
// ricerca è tutta nel browser (nessuna chiamata).
export interface VoceRicerca {
  id: string;
  tab: string;
  sezione: string;
  titolo: string;
  testo: string;
}

function normalizza(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function estratto(testo: string, termini: string[]): string {
  const flat = testo.replace(/\s+/g, " ").trim();
  const n = normalizza(flat);
  const pos = termini.map((t) => n.indexOf(t)).filter((p) => p >= 0).sort((a, b) => a - b)[0] ?? 0;
  const da = Math.max(0, pos - 30);
  return (da > 0 ? "…" : "") + flat.slice(da, da + 120) + (flat.length > da + 120 ? "…" : "");
}

export default function CommessaRicerca({ commessaId, indice }: { commessaId: string; indice: VoceRicerca[] }) {
  const [q, setQ] = useState("");
  const [aperta, setAperta] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const indiceNorm = useMemo(() => indice.map((v) => ({ v, n: normalizza(`${v.titolo} ${v.testo} ${v.sezione}`) })), [indice]);
  const termini = useMemo(() => normalizza(q).split(/\s+/).filter(Boolean), [q]);
  const risultati = useMemo(
    () => (termini.length === 0 ? [] : indiceNorm.filter(({ n }) => termini.every((t) => n.includes(t))).map(({ v }) => v)),
    [indiceNorm, termini],
  );

  useEffect(() => {
    function fuori(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAperta(false);
    }
    document.addEventListener("mousedown", fuori);
    return () => document.removeEventListener("mousedown", fuori);
  }, []);

  return (
    <div ref={boxRef} className="relative flex-1 min-w-[260px] max-w-xl">
      <input
        type="search"
        value={q}
        onChange={(e) => { setQ(e.target.value); setAperta(true); }}
        onFocus={() => setAperta(true)}
        onKeyDown={(e) => { if (e.key === "Escape") { setAperta(false); (e.target as HTMLInputElement).blur(); } }}
        placeholder="Cerca in specifiche, storico, campionature, documenti, note…"
        aria-label="Cerca nella commessa"
        className="w-full border rounded-lg px-4 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
        style={{ borderColor: "#E4E0DA" }}
      />
      {aperta && termini.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg border bg-white shadow-lg max-h-[60vh] overflow-y-auto" style={{ borderColor: "#E4E0DA" }}>
          {risultati.length === 0 ? (
            <p className="p-4 text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessun risultato per «{q}».</p>
          ) : (
            <>
              <p className="px-4 pt-2 text-xs" style={{ color: "var(--color-grey-mid)" }}>{risultati.length} risultati</p>
              <ul className="divide-y divide-gray-100">
                {risultati.slice(0, 50).map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/commesse/${commessaId}?tab=${r.tab}&r=${encodeURIComponent(r.id)}`}
                      scroll={false}
                      onClick={() => setAperta(false)}
                      className="block px-4 py-2.5 hover:bg-gray-50"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase rounded px-1.5 py-0.5" style={{ background: "#EFEBE5", color: "var(--color-grey-mid)" }}>{r.sezione}</span>
                        <span className="text-sm font-medium truncate">{r.titolo}</span>
                      </span>
                      {r.testo && <span className="block text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>{estratto(r.testo, termini)}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
