"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { Scheda } from "@/lib/types";
import BadgeStato from "./BadgeStato";
import FormModificaScheda from "./FormModificaScheda";

const PAGE_SIZE = 100;
const STATI_COMPLETATI = new Set(["Completato", "Completata", "Chiusa", "Annullato"]);

type SortKey = "odp" | "numeroScheda" | "clienteInfo" | "statoProduzione" | "dataProduzionePrevista" | "dataRientroPrevista";
type SortDir = "asc" | "desc";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

function cmp(a: Scheda, b: Scheda, key: SortKey, dir: SortDir): number {
  const va = (a[key] as string) ?? "";
  const vb = (b[key] as string) ?? "";
  const res = va < vb ? -1 : va > vb ? 1 : 0;
  return dir === "asc" ? res : -res;
}

function isInRitardo(scheda: Scheda, today: string) {
  const completato = STATI_COMPLETATI.has(scheda.statoProduzione);
  return {
    produzione: !completato && !!scheda.dataProduzionePrevista && scheda.dataProduzionePrevista < today,
    rientro: !completato && scheda.produzioneEsterna && !!scheda.dataRientroPrevista && scheda.dataRientroPrevista < today,
  };
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className="ml-1 inline-block text-[10px] opacity-60">
      {active ? (dir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );
}

function DataCell({ date, inRitardo }: { date: string | null; inRitardo: boolean }) {
  if (!date) return <span style={{ color: "var(--color-grey-icon)" }}>—</span>;
  if (inRitardo) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums"
        style={{ background: "#FEE2E2", color: "#991B1B" }}
      >
        ⚠ {fmt(date)}
      </span>
    );
  }
  return <span className="tabular-nums whitespace-nowrap">{fmt(date)}</span>;
}

function fileProxyUrl(pageId: string, prop: string, index: number) {
  return `/api/files/${pageId}?prop=${encodeURIComponent(prop)}&index=${index}`;
}

function PdfLinks({ pageId, count }: { pageId: string; count: number }) {
  if (!count) return <span style={{ color: "var(--color-grey-icon)" }}>—</span>;
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <a
          key={i}
          href={fileProxyUrl(pageId, "PDF Allegato", i)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium hover:underline transition-colors"
          style={{ color: "#DC2626" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8.5 17.5c-.3 0-.5-.1-.7-.3-.4-.4-.4-1 0-1.4l4-4c.4-.4 1-.4 1.4 0l1.5 1.5 1.8-2.4c.2-.3.5-.4.8-.4s.6.2.8.4l2 3c.3.4.2 1-.2 1.3-.4.3-1 .2-1.3-.2l-1.3-1.9-1.8 2.4c-.2.3-.5.4-.8.4s-.6-.1-.8-.4l-1.5-1.5-3.3 3.3c-.2.2-.4.2-.6.2z"/>
          </svg>
          {count > 1 ? `PDF ${i + 1}` : "PDF"}
        </a>
      ))}
    </div>
  );
}

// Cache URL copertina per tutta la durata della sessione
const copertinaUrlCache = new Map<string, string | null>();

interface TooltipState {
  pageId: string;
  x: number;
  y: number;
}

function CopertinaTooltip({ tooltip }: { tooltip: TooltipState | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tooltip) return;
    const { pageId } = tooltip;

    if (copertinaUrlCache.has(pageId)) {
      setImgUrl(copertinaUrlCache.get(pageId) ?? null);
      return;
    }

    setImgUrl(null);
    setLoading(true);
    fetch(`/api/files/${pageId}?prop=${encodeURIComponent("Copertina")}&index=0&json=1`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const url: string | null = data?.url ?? null;
        copertinaUrlCache.set(pageId, url);
        setImgUrl(url);
      })
      .catch(() => { copertinaUrlCache.set(pageId, null); })
      .finally(() => setLoading(false));
  }, [tooltip?.pageId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!tooltip || !ref.current) return;
    const { x, y } = tooltip;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const W = 220;
    const H = 200;
    const left = x + 20 + W > vw ? x - W - 12 : x + 20;
    const top = y + 12 + H > vh ? vh - H - 12 : y + 12;
    setPos({ top, left });
  }, [tooltip]);

  if (!tooltip) return null;

  return (
    <div
      ref={ref}
      className="fixed z-50 pointer-events-none rounded-lg shadow-2xl border border-gray-200 overflow-hidden"
      style={{ top: pos.top, left: pos.left, width: 220, background: "white" }}
    >
      {loading && (
        <div className="flex items-center justify-center" style={{ height: 100, background: "#f3f4f6" }}>
          <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</span>
        </div>
      )}
      {imgUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imgUrl} alt="Copertina" className="block w-full" style={{ maxHeight: 220, objectFit: "contain" }} />
      )}
      {!loading && !imgUrl && (
        <div className="flex items-center justify-center" style={{ height: 60 }}>
          <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Immagine non disponibile</span>
        </div>
      )}
    </div>
  );
}

export default function TabellaSchede({ schede: initial }: { schede: Scheda[] }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [schede, setSchede] = useState(initial);
  const [search, setSearch] = useState("");
  const [filtroStato, setFiltroStato] = useState("");
  const [filtroEsterna, setFiltroEsterna] = useState<"" | "si" | "no">("");
  const [filtroRitardoProd, setFiltroRitardoProd] = useState(false);
  const [filtroRitardoRientro, setFiltroRitardoRientro] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateField, setDateField] = useState<"dataProduzionePrevista" | "dataRientroPrevista">("dataProduzionePrevista");
  const [sortKey, setSortKey] = useState<SortKey>("odp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Scheda | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const statiUniq = useMemo(
    () => Array.from(new Set(schede.map((s) => s.statoProduzione).filter(Boolean))).sort(),
    [schede]
  );

  const conteggioRitardoProd = useMemo(
    () => schede.filter((s) => isInRitardo(s, today).produzione).length,
    [schede, today]
  );
  const conteggioRitardoRientro = useMemo(
    () => schede.filter((s) => isInRitardo(s, today).rientro).length,
    [schede, today]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return schede
      .filter((s) => {
        if (q && !`${s.odp} ${s.clienteInfo} ${s.numeroScheda} ${s.commessaNr}`.toLowerCase().includes(q)) return false;
        if (filtroStato && s.statoProduzione !== filtroStato) return false;
        if (filtroEsterna === "si" && !s.produzioneEsterna) return false;
        if (filtroEsterna === "no" && s.produzioneEsterna) return false;
        if (filtroRitardoProd && !isInRitardo(s, today).produzione) return false;
        if (filtroRitardoRientro && !isInRitardo(s, today).rientro) return false;
        const val = s[dateField] ?? "";
        if (dateFrom && val < dateFrom) return false;
        if (dateTo && val > dateTo) return false;
        return true;
      })
      .sort((a, b) => cmp(a, b, sortKey, sortDir));
  }, [schede, search, filtroStato, filtroEsterna, filtroRitardoProd, filtroRitardoRientro, dateFrom, dateTo, dateField, sortKey, sortDir, today]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageSlice = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key.startsWith("data") ? "asc" : "desc"); }
    setPage(0);
  }

  function handleFilter(fn: () => void) { fn(); setPage(0); }

  function handleSave(updated: Scheda) {
    setSchede((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setEditing(null);
  }

  const inputCls = "border rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

  function Th({ label, sortable, className = "" }: { label: string; sortable?: SortKey; className?: string }) {
    const active = sortable === sortKey;
    return (
      <th
        className={`px-4 py-3 whitespace-nowrap select-none ${sortable ? "cursor-pointer hover:bg-orange-50/50" : ""} ${className}`}
        onClick={sortable ? () => handleSort(sortable) : undefined}
      >
        {label}
        {sortable && <SortIcon active={active} dir={active ? sortDir : "asc"} />}
      </th>
    );
  }

  function RitardoBtn({ label, count, active, onToggle }: { label: string; count: number; active: boolean; onToggle: () => void }) {
    return (
      <button
        onClick={() => handleFilter(onToggle)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-sm font-medium transition-colors"
        style={active
          ? { background: "#FEE2E2", color: "#991B1B", borderColor: "#FCA5A5" }
          : { background: "white", color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}
      >
        ⚠ {label}
        {count > 0 && (
          <span
            className="inline-flex items-center justify-center rounded-full text-xs font-bold w-5 h-5"
            style={active ? { background: "#991B1B", color: "white" } : { background: "#FEE2E2", color: "#991B1B" }}
          >
            {count}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filtri riga 1 */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          className={inputCls + " min-w-52"}
          placeholder="Cerca ODP, cliente, N° scheda…"
          value={search}
          onChange={(e) => handleFilter(() => setSearch(e.target.value))}
        />
        <select className={inputCls} value={filtroStato} onChange={(e) => handleFilter(() => setFiltroStato(e.target.value))}>
          <option value="">Tutti gli stati</option>
          {statiUniq.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={inputCls} value={filtroEsterna} onChange={(e) => handleFilter(() => setFiltroEsterna(e.target.value as "" | "si" | "no"))}>
          <option value="">Interna + Esterna</option>
          <option value="si">Solo Esterna</option>
          <option value="no">Solo Interna</option>
        </select>
        <RitardoBtn label="Prod. in ritardo" count={conteggioRitardoProd} active={filtroRitardoProd} onToggle={() => setFiltroRitardoProd((v) => !v)} />
        <RitardoBtn label="Rientro in ritardo" count={conteggioRitardoRientro} active={filtroRitardoRientro} onToggle={() => setFiltroRitardoRientro((v) => !v)} />
        <span className="ml-auto text-sm" style={{ color: "var(--color-grey-mid)" }}>
          {filtered.length} schede
        </span>
      </div>

      {/* Filtri riga 2 — date */}
      <div className="flex flex-wrap gap-3 items-center">
        <select className={inputCls} value={dateField} onChange={(e) => handleFilter(() => setDateField(e.target.value as typeof dateField))}>
          <option value="dataProduzionePrevista">Data Produzione Prev.</option>
          <option value="dataRientroPrevista">Data Rientro Prev.</option>
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Dal</label>
          <input type="date" className={inputCls} value={dateFrom} onChange={(e) => handleFilter(() => setDateFrom(e.target.value))} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Al</label>
          <input type="date" className={inputCls} value={dateTo} onChange={(e) => handleFilter(() => setDateTo(e.target.value))} />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); setPage(0); }}
            className="text-xs px-2 py-1.5 rounded border font-medium hover:bg-gray-50 transition-colors"
            style={{ color: "var(--color-grey-mid)" }}
          >
            ✕ Azzera date
          </button>
        )}
      </div>

      {/* Tabella */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <Th label="ODP" sortable="odp" />
              <Th label="N° Scheda" sortable="numeroScheda" />
              <Th label="Cliente / Commessa" sortable="clienteInfo" />
              <Th label="Stato" sortable="statoProduzione" />
              <Th label="Data Prod. Prev." sortable="dataProduzionePrevista" />
              <th className="px-4 py-3 whitespace-nowrap">Esterna</th>
              <th className="px-4 py-3">Fornitore</th>
              <Th label="Rientro Prev." sortable="dataRientroPrevista" />
              <th className="px-4 py-3 whitespace-nowrap">PDF</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {pageSlice.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessuna scheda trovata
                </td>
              </tr>
            ) : (
              pageSlice.map((s) => {
                const ritardo = isInRitardo(s, today);
                const rowInRitardo = ritardo.produzione || ritardo.rientro;
                return (
                  <tr
                    key={s.id}
                    className="border-b last:border-0 transition-colors"
                    style={rowInRitardo ? { background: "#FFF8F8" } : undefined}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = rowInRitardo ? "#FEE9E9" : "#FFF8F0"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = rowInRitardo ? "#FFF8F8" : ""; }}
                  >
                    {/* ODP con tooltip copertina */}
                    <td
                      className="px-4 py-3 font-mono text-xs font-semibold whitespace-nowrap"
                      onMouseEnter={s.copertina ? (e) => setTooltip({ pageId: s.id, x: e.clientX, y: e.clientY }) : undefined}
                      onMouseMove={s.copertina ? (e) => setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null) : undefined}
                      onMouseLeave={s.copertina ? () => setTooltip(null) : undefined}
                    >
                      <span className={s.copertina ? "cursor-default underline decoration-dotted decoration-gray-400" : ""}>
                        {s.odp || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{s.numeroScheda || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.clienteInfo || "—"}</div>
                      {s.commessaNr && <div className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{s.commessaNr}</div>}
                    </td>
                    <td className="px-4 py-3"><BadgeStato stato={s.statoProduzione} /></td>
                    <td className="px-4 py-3"><DataCell date={s.dataProduzionePrevista} inRitardo={ritardo.produzione} /></td>
                    <td className="px-4 py-3">
                      {s.produzioneEsterna
                        ? <span className="text-blue-600 font-medium text-xs">Sì</span>
                        : <span style={{ color: "var(--color-grey-icon)" }} className="text-xs">No</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">{s.fornitore || "—"}</td>
                    <td className="px-4 py-3"><DataCell date={s.dataRientroPrevista} inRitardo={ritardo.rientro} /></td>
                    <td className="px-4 py-3"><PdfLinks pageId={s.id} count={s.pdfAllegato.length} /></td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditing(s)}
                        className="text-xs px-2 py-1 rounded font-medium transition-colors"
                        style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)" }}
                      >
                        Modifica
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginazione */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: "var(--color-grey-mid)" }}>
            Pagina {currentPage + 1} di {totalPages} · record {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} di {filtered.length}
          </span>
          <div className="flex gap-2">
            <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}
              className="px-3 py-1.5 rounded border text-xs font-medium disabled:opacity-40 hover:bg-gray-50 transition-colors">
              ← Precedente
            </button>
            <button disabled={currentPage >= totalPages - 1} onClick={() => setPage(currentPage + 1)}
              className="px-3 py-1.5 rounded border text-xs font-medium disabled:opacity-40 hover:bg-gray-50 transition-colors">
              Successiva →
            </button>
          </div>
        </div>
      )}

      {editing && <FormModificaScheda scheda={editing} onClose={() => setEditing(null)} onSave={handleSave} />}
      <CopertinaTooltip tooltip={tooltip} />
    </div>
  );
}
