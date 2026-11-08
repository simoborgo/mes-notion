"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RisultatoRicerca, TipoRisultato } from "@/lib/ricercaRepository";

// Ricerca globale della home. La ricerca vera è lato server (/api/ricerca, filtrata per ruolo):
// qui solo input, debounce, gruppi di risultati e navigazione da tastiera.

const TIPI: { tipo: TipoRisultato; label: string; sigla: string; colore: string }[] = [
  { tipo: "commessa", label: "Commesse", sigla: "C", colore: "#F08F25" },
  { tipo: "scheda", label: "Schede / ODP", sigla: "S", colore: "#3B82F6" },
  { tipo: "ritiro", label: "Ritiri e consegne", sigla: "R", colore: "#10B981" },
  { tipo: "carico", label: "Carichi", sigla: "K", colore: "#8B5CF6" },
];

const BADGE: Record<string, { bg: string; fg: string }> = {
  "In produzione": { bg: "#FEF3E2", fg: "#C06A10" },
  "In lavorazione": { bg: "#FEF3E2", fg: "#C06A10" },
  "In montaggio": { bg: "#ECFDF5", fg: "#059669" },
  "In spedizione": { bg: "#EBF3FF", fg: "#2563EB" },
  ShopDrawing: { bg: "#F3EEFE", fg: "#7C3AED" },
  "Da Fare": { bg: "#FEF3E2", fg: "#C06A10" },
  "In corso": { bg: "#EBF3FF", fg: "#2563EB" },
  Pianificato: { bg: "#F3EEFE", fg: "#7C3AED" },
  Confermato: { bg: "#ECFDF5", fg: "#059669" },
};
const BADGE_SPENTO = { bg: "#F1F1F1", fg: "#6B6560" };
const BADGE_DEFAULT = { bg: "#EFEBE5", fg: "#6B6560" };

function normalizza(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Evidenzia i termini cercati. Lavora sul testo normalizzato (stessa lunghezza dell'originale per
// le lettere accentate precomposte), quindi gli indici valgono anche sul testo da mostrare.
function Evidenzia({ testo, termini }: { testo: string; termini: string[] }) {
  const n = normalizza(testo);
  const intervalli: [number, number][] = [];
  if (n.length === testo.length) {
    for (const t of termini) {
      let i = n.indexOf(t);
      while (i >= 0) { intervalli.push([i, i + t.length]); i = n.indexOf(t, i + t.length); }
    }
  }
  intervalli.sort((a, b) => a[0] - b[0]);
  const parti: React.ReactNode[] = [];
  let p = 0;
  intervalli.forEach(([a, b], k) => {
    if (a < p) return;
    if (a > p) parti.push(testo.slice(p, a));
    parti.push(<mark key={k} style={{ background: "rgba(240,143,37,0.28)", color: "inherit", borderRadius: 2 }}>{testo.slice(a, b)}</mark>);
    p = b;
  });
  parti.push(testo.slice(p));
  return <>{parti}</>;
}

export default function RicercaGlobale() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [aperta, setAperta] = useState(false);
  const [risultati, setRisultati] = useState<RisultatoRicerca[]>([]);
  const [caricamento, setCaricamento] = useState(false);
  const [errore, setErrore] = useState(false);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const pannelloRef = useRef<HTMLDivElement>(null);

  const termini = useMemo(() => normalizza(q).split(/\s+/).filter(Boolean), [q]);
  const pronta = q.trim().length >= 2;

  useEffect(() => {
    if (!pronta) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ricerca?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setRisultati(data.risultati ?? []);
        setErrore(false);
        setSel(0);
        setCaricamento(false);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setRisultati([]);
        setErrore(true);
        setCaricamento(false);
      }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, pronta]);

  // Risultati nell'ordine di visualizzazione (gruppi), così frecce e Invio seguono ciò che si vede
  const gruppi = useMemo(
    () => TIPI.map((g) => ({ ...g, righe: risultati.filter((r) => r.tipo === g.tipo) })).filter((g) => g.righe.length > 0),
    [risultati],
  );
  const piatti = useMemo(() => gruppi.flatMap((g) => g.righe), [gruppi]);

  useEffect(() => {
    function fuori(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAperta(false);
    }
    function scorciatoia(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const inCampo = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (e.key === "/" && !inCampo && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", fuori);
    document.addEventListener("keydown", scorciatoia);
    return () => { document.removeEventListener("mousedown", fuori); document.removeEventListener("keydown", scorciatoia); };
  }, []);

  useEffect(() => {
    pannelloRef.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  function apri(r: RisultatoRicerca) {
    setAperta(false);
    router.push(r.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setAperta(true); if (piatti.length) setSel((s) => (s + 1) % piatti.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (piatti.length) setSel((s) => (s - 1 + piatti.length) % piatti.length); }
    else if (e.key === "Enter") { const r = piatti[sel]; if (r) { e.preventDefault(); apri(r); } }
    else if (e.key === "Escape") { setAperta(false); inputRef.current?.blur(); }
  }

  // Posizione di ogni riga nell'elenco piatto (per evidenziare quella selezionata con le frecce)
  const offset = gruppi.map((_, k) => gruppi.slice(0, k).reduce((n, g) => n + g.righe.length, 0));
  const mostraPannello = aperta && q.trim().length > 0;

  return (
    <div ref={boxRef} className="relative w-full max-w-3xl mx-auto">
      <label
        className="flex items-center gap-3 bg-white rounded-xl px-4 h-14 border-[1.5px] shadow-sm focus-within:ring-[3px] focus-within:ring-orange-300/60"
        style={{ borderColor: "#E4E0DA" }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A4A4A6" strokeWidth="2" strokeLinecap="round" className="shrink-0">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setAperta(true); setErrore(false); setCaricamento(e.target.value.trim().length >= 2); }}
          onFocus={() => setAperta(true)}
          onKeyDown={onKeyDown}
          placeholder="Cerca commesse, schede, ritiri, carichi…"
          aria-label="Ricerca globale"
          autoComplete="off"
          className="flex-1 min-w-0 bg-transparent outline-none text-[17px]"
          style={{ boxShadow: "none" }}
        />
        <kbd className="hidden sm:block text-xs rounded px-1.5 py-0.5 border border-b-2 bg-[#faf9f7]" style={{ color: "var(--color-grey-mid)", borderColor: "#E4E0DA" }}>/</kbd>
      </label>

      {mostraPannello && (
        <div
          ref={pannelloRef}
          className="absolute left-0 right-0 top-full mt-1.5 z-30 rounded-xl border bg-white shadow-xl max-h-[70vh] overflow-y-auto"
          style={{ borderColor: "#E4E0DA" }}
        >
          {!pronta ? (
            <p className="px-4 py-4 text-sm" style={{ color: "var(--color-grey-mid)" }}>Scrivi almeno 2 caratteri…</p>
          ) : errore ? (
            <p className="px-4 py-4 text-sm text-red-600">Ricerca non riuscita. Riprova tra un attimo.</p>
          ) : caricamento && piatti.length === 0 ? (
            <p className="px-4 py-4 text-sm" style={{ color: "var(--color-grey-mid)" }}>Cerco…</p>
          ) : piatti.length === 0 ? (
            <p className="px-4 py-4 text-sm" style={{ color: "var(--color-grey-mid)" }}>
              Nessun risultato per «{q.trim()}». Prova con meno parole o con il numero di commessa/ODP.
            </p>
          ) : (
            <div style={{ opacity: caricamento ? 0.6 : 1 }}>
              {gruppi.map((g, gi) => (
                <div key={g.tipo}>
                  <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: "var(--color-grey-mid)" }}>
                    {g.label} <span className="font-medium">{g.righe.length}</span>
                    <span className="flex-1 h-px" style={{ background: "#f0ece6" }} />
                  </div>
                  {g.righe.map((r, ri) => {
                    const i = offset[gi] + ri;
                    const badge = !r.attivo ? BADGE_SPENTO : (BADGE[r.badge] ?? BADGE_DEFAULT);
                    return (
                      <button
                        key={`${r.tipo}-${r.id}`}
                        type="button"
                        data-i={i}
                        onClick={() => apri(r)}
                        onMouseEnter={() => setSel(i)}
                        className="w-full text-left flex items-center gap-3 px-4 py-2 cursor-pointer"
                        style={{ background: i === sel ? "#FFF6EA" : undefined }}
                      >
                        <span className="w-8 h-8 rounded-lg grid place-items-center text-xs font-bold text-white shrink-0" style={{ background: g.colore }}>{g.sigla}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[15px] font-medium truncate"><Evidenzia testo={r.titolo} termini={termini} /></span>
                          {r.sottotitolo && (
                            <span className="block text-[12.5px] truncate" style={{ color: "var(--color-grey-mid)" }}>
                              <Evidenzia testo={r.sottotitolo} termini={termini} />
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: badge.bg, color: badge.fg }}>{r.badge}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              <div className="sticky bottom-0 flex gap-4 px-4 py-2 border-t text-[11.5px]" style={{ background: "#faf9f7", borderColor: "#f0ece6", color: "var(--color-grey-mid)" }}>
                <span>↑↓ naviga</span><span>↵ apri</span><span>Esc chiudi</span>
                <span className="ml-auto">Completati in fondo a ogni gruppo</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
