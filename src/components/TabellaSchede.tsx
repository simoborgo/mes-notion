"use client";

import { useState, useMemo, useRef, useEffect, useTransition, Fragment } from "react";
import { useRouter } from "next/navigation";
import type { Scheda, Commessa } from "@/lib/types";
import BadgeStato from "./BadgeStato";
import FormModificaScheda from "./FormModificaScheda";

const PAGE_SIZE = 100;
const STATI_COMPLETATI = new Set(["Completato", "Annullato"]);

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
    const W = 380;
    const H = 320;
    const left = x + 20 + W > vw ? x - W - 12 : x + 20;
    const top = y + 12 + H > vh ? vh - H - 12 : y + 12;
    setPos({ top, left });
  }, [tooltip]);

  if (!tooltip) return null;

  return (
    <div
      ref={ref}
      className="fixed z-50 pointer-events-none rounded-lg shadow-2xl border border-gray-200 overflow-hidden"
      style={{ top: pos.top, left: pos.left, width: 380, background: "white" }}
    >
      {loading && (
        <div className="flex items-center justify-center" style={{ height: 100, background: "#f3f4f6" }}>
          <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</span>
        </div>
      )}
      {imgUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imgUrl} alt="Copertina" className="block w-full" style={{ maxHeight: 360, objectFit: "contain" }} />
      )}
      {!loading && !imgUrl && (
        <div className="flex items-center justify-center" style={{ height: 60 }}>
          <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Immagine non disponibile</span>
        </div>
      )}
    </div>
  );
}

export default function TabellaSchede({ schede: initial, sottoschede = [], commesse = [], revalidate }: { schede: Scheda[]; sottoschede?: Scheda[]; commesse?: Commessa[]; revalidate?: () => Promise<void> }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const sottoschedeByParent = useMemo(() => {
    const map = new Map<string, Scheda[]>();
    for (const s of sottoschede) {
      if (!s.parentId) continue;
      const arr = map.get(s.parentId) ?? [];
      arr.push(s);
      map.set(s.parentId, arr);
    }
    return map;
  }, [sottoschede]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleReload() {
    if (!revalidate) return;
    startTransition(async () => { await revalidate(); router.refresh(); });
  }

  const [schede, setSchede] = useState(initial);
  const [search, setSearch] = useState("");
  const [filtroFornitore, setFiltroFornitore] = useState("");
  const [filtroCommessa, setFiltroCommessa] = useState("");
  const [filtroStati, setFiltroStati] = useState<Set<string>>(
    () => new Set(initial.map((s) => s.statoProduzione).filter((s): s is string => !!s && s !== "Completato"))
  );
  const [filtroEsterna, setFiltroEsterna] = useState(false);
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

  const fornitoriUniq = useMemo(
    () => Array.from(new Set(schede.map((s) => s.fornitore).filter(Boolean))).sort() as string[],
    [schede]
  );

  const [nascondiChiuse, setNascondiChiuse] = useState(true);

  const commesseChiuseNr = useMemo(
    () => new Set(commesse.filter((c) => c.stato === "Chiusa").map((c) => c.numeroCommessa)),
    [commesse]
  );

  const commesseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of schede) {
      if (!s.commessaNr || map.has(s.commessaNr)) continue;
      if (nascondiChiuse && commesseChiuseNr.has(s.commessaNr)) continue;
      const resto = s.clienteInfo.replace(/^\d+\s*/, "").trim();
      map.set(s.commessaNr, resto ? `${s.commessaNr} — ${resto}` : s.commessaNr);
    }
    return Array.from(map.entries())
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([nr, label]) => ({ nr, label }));
  }, [schede, nascondiChiuse, commesseChiuseNr]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return schede
      .filter((s) => {
        if (q && !`${s.odp} ${s.clienteInfo} ${s.numeroScheda} ${s.commessaNr}`.toLowerCase().includes(q)) return false;
        if (filtroStati.size > 0 && !filtroStati.has(s.statoProduzione ?? "")) return false;
        if (filtroEsterna && !s.produzioneEsterna) return false;
        if (filtroRitardoProd && !isInRitardo(s, today).produzione) return false;
        if (filtroRitardoRientro && !isInRitardo(s, today).rientro) return false;
        if (filtroFornitore && s.fornitore !== filtroFornitore) return false;
        if (filtroCommessa && s.commessaNr !== filtroCommessa) return false;
        const val = s[dateField] ?? "";
        if (dateFrom && val < dateFrom) return false;
        if (dateTo && val > dateTo) return false;
        return true;
      })
      .sort((a, b) => cmp(a, b, sortKey, sortDir));
  }, [schede, search, filtroStati, filtroEsterna, filtroRitardoProd, filtroRitardoRientro, filtroFornitore, filtroCommessa, dateFrom, dateTo, dateField, sortKey, sortDir, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // Contatori ritardo basati sui filtri attivi (esclusi i filtri ritardo stessi)
  const filteredSenzaRitardo = useMemo(() => {
    const q = search.toLowerCase();
    return schede.filter((s) => {
      if (q && !`${s.odp} ${s.clienteInfo} ${s.numeroScheda} ${s.commessaNr}`.toLowerCase().includes(q)) return false;
      if (filtroStati.size > 0 && !filtroStati.has(s.statoProduzione ?? "")) return false;
      if (filtroEsterna && !s.produzioneEsterna) return false;
      if (filtroFornitore && s.fornitore !== filtroFornitore) return false;
      if (filtroCommessa && s.commessaNr !== filtroCommessa) return false;
      const val = s[dateField] ?? "";
      if (dateFrom && val < dateFrom) return false;
      if (dateTo && val > dateTo) return false;
      return true;
    });
  }, [schede, search, filtroStati, filtroEsterna, filtroFornitore, filtroCommessa, dateFrom, dateTo, dateField, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const conteggioRitardoProd = useMemo(
    () => filteredSenzaRitardo.filter((s) => isInRitardo(s, today).produzione).length,
    [filteredSenzaRitardo, today]
  );
  const conteggioRitardoRientro = useMemo(
    () => filteredSenzaRitardo.filter((s) => isInRitardo(s, today).rientro).length,
    [filteredSenzaRitardo, today]
  );

  const filtriAttiviLabel = useMemo(() => {
    const parts: string[] = [];
    if (search) parts.push(`Ricerca: "${search}"`);
    if (filtroStati.size > 0) parts.push(`Stato: ${Array.from(filtroStati).join(", ")}`);
    if (filtroEsterna) parts.push("Solo produzione esterna");
    if (filtroFornitore) parts.push(`Fornitore: ${filtroFornitore}`);
    if (filtroCommessa) {
      const opt = commesseOptions.find((o) => o.nr === filtroCommessa);
      parts.push(`Commessa: ${opt?.label ?? filtroCommessa}`);
    }
    if (dateFrom || dateTo) {
      const campo = dateField === "dataProduzionePrevista" ? "Data Prod. Prev." : "Data Rientro Prev.";
      parts.push(`${campo}: ${dateFrom || "…"} → ${dateTo || "…"}`);
    }
    if (filtroRitardoProd) parts.push("Solo prod. in ritardo");
    if (filtroRitardoRientro) parts.push("Solo rientro in ritardo");
    if (nascondiChiuse) parts.push("Senza commesse chiuse");
    return parts.length > 0 ? parts.join(" · ") : "Nessun filtro attivo";
  }, [search, filtroStati, filtroEsterna, filtroFornitore, filtroCommessa, commesseOptions, dateFrom, dateTo, dateField, filtroRitardoProd, filtroRitardoRientro, nascondiChiuse]);

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
      {/* Riga stampa */}
      <div className="no-print flex justify-end">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-base font-semibold transition-opacity hover:opacity-90"
          style={{ background: "var(--color-primary)", color: "white" }}
        >
          <span style={{ fontSize: 22 }}>🖨</span> Stampa vista corrente
        </button>
      </div>

      {/* Barra superiore: toggle ritardo + ricarica */}
      <div className="no-print flex flex-wrap gap-2 items-center justify-end">
        <RitardoBtn label="Prod. in ritardo" count={conteggioRitardoProd} active={filtroRitardoProd} onToggle={() => setFiltroRitardoProd((v) => !v)} />
        <RitardoBtn label="Rientro in ritardo" count={conteggioRitardoRientro} active={filtroRitardoRientro} onToggle={() => setFiltroRitardoRientro((v) => !v)} />
        {revalidate && (
          <button
            onClick={handleReload}
            disabled={pending}
            className="flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-medium transition-colors disabled:opacity-50"
            style={{ borderColor: "var(--color-grey-icon)", color: "var(--color-grey-mid)" }}
          >
            <span className={pending ? "animate-spin inline-block" : "inline-block"}>↻</span>
            {pending ? "Caricamento…" : "Ricarica dati"}
          </button>
        )}
      </div>

      {/* Filtri riga 1 */}
      <div className="no-print flex flex-wrap gap-3 items-center">
        <input
          className={inputCls + " min-w-52"}
          placeholder="Cerca ODP, cliente, N° scheda…"
          value={search}
          onChange={(e) => handleFilter(() => setSearch(e.target.value))}
        />
        <div className="flex flex-wrap gap-1.5 items-center">
          {statiUniq.map((s) => {
            const active = filtroStati.has(s);
            return (
              <button
                key={s}
                onClick={() => handleFilter(() => setFiltroStati((prev) => {
                  const next = new Set(prev);
                  active ? next.delete(s) : next.add(s);
                  return next;
                }))}
                className="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
                style={{
                  background: active ? "var(--color-primary)" : "white",
                  color: active ? "white" : "var(--color-grey-mid)",
                  borderColor: active ? "var(--color-primary)" : "#d1d5db",
                }}
              >
                {s}
              </button>
            );
          })}
          {filtroStati.size > 0 && (
            <button
              onClick={() => handleFilter(() => setFiltroStati(new Set()))}
              className="text-xs px-2 py-1 rounded border"
              style={{ color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}
            >
              ✕ Azzera
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm" style={{ color: "var(--color-black)" }}>
          <input
            type="checkbox"
            checked={filtroEsterna}
            onChange={(e) => handleFilter(() => setFiltroEsterna(e.target.checked))}
            className="w-4 h-4 cursor-pointer accent-orange-500"
          />
          Solo produzione esterna
        </label>
        <select className={inputCls} value={filtroFornitore} onChange={(e) => handleFilter(() => setFiltroFornitore(e.target.value))}>
          <option value="">Tutti i fornitori</option>
          {fornitoriUniq.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <span className="ml-auto text-sm" style={{ color: "var(--color-grey-mid)" }}>
          {filtered.length} schede
        </span>
      </div>

      {/* Filtri riga 2 — date */}
      <div className="no-print flex flex-wrap gap-3 items-center">
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

      {/* Filtri riga 3 — commessa */}
      <div className="no-print flex flex-wrap gap-3 items-center">
        <select className={inputCls} value={filtroCommessa} onChange={(e) => handleFilter(() => setFiltroCommessa(e.target.value))}>
          <option value="">Tutte le commesse</option>
          {commesseOptions.map(({ nr, label }) => <option key={nr} value={nr}>{label}</option>)}
        </select>
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm" style={{ color: "var(--color-black)" }}>
          <input
            type="checkbox"
            checked={nascondiChiuse}
            onChange={(e) => handleFilter(() => setNascondiChiuse(e.target.checked))}
            className="w-4 h-4 cursor-pointer accent-orange-500"
          />
          Nascondi commesse chiuse
        </label>
      </div>

      {/* Tabella */}
      <div className="no-print overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <Th label="Cliente / Commessa" sortable="clienteInfo" className="min-w-[200px]" />
              <Th label="ODP" sortable="odp" />
              <Th label="N° Scheda" sortable="numeroScheda" />
              <th className="px-4 py-3 min-w-[180px]">Descrizione</th>
              <Th label="Stato" sortable="statoProduzione" />
              <th className="px-4 py-3 whitespace-nowrap">Fase</th>
              <Th label="Data Prod. Prev." sortable="dataProduzionePrevista" />
              <th className="px-4 py-3">Fornitore</th>
              <Th label="Rientro Prev." sortable="dataRientroPrevista" />
              <th className="px-4 py-3 whitespace-nowrap">PDF</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {pageSlice.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessuna scheda trovata
                </td>
              </tr>
            ) : (
              pageSlice.map((s) => {
                const ritardo = isInRitardo(s, today);
                const rowInRitardo = ritardo.produzione || ritardo.rientro;
                const figlie = sottoschedeByParent.get(s.id) ?? [];
                const expanded = expandedIds.has(s.id);
                return (
                  <Fragment key={s.id}>
                  <tr
                    className="border-b last:border-0 transition-colors"
                    style={rowInRitardo ? { background: "#FFF8F8" } : undefined}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = rowInRitardo ? "#FEE9E9" : "#FFF8F0"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = rowInRitardo ? "#FFF8F8" : ""; }}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.clienteInfo || "—"}</div>
                      {s.commessaNr && <div className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{s.commessaNr}</div>}
                    </td>
                    {/* ODP con tooltip copertina + freccia sottoschede */}
                    <td
                      className="px-4 py-3 font-mono text-sm font-bold whitespace-nowrap"
                      onMouseEnter={s.copertina ? (e) => setTooltip({ pageId: s.id, x: e.clientX, y: e.clientY }) : undefined}
                      onMouseMove={s.copertina ? (e) => setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null) : undefined}
                      onMouseLeave={s.copertina ? () => setTooltip(null) : undefined}
                    >
                      {figlie.length > 0 ? (
                        <button
                          onClick={() => toggleExpand(s.id)}
                          className="no-print inline-flex items-center gap-1.5 hover:opacity-70 transition-opacity"
                        >
                          <span className="inline-flex items-center justify-center w-4 h-4 text-xs transition-transform" style={{ color: "var(--color-primary)", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                          <span>{s.odp || "—"}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(240,143,37,0.12)", color: "var(--color-primary)" }}>
                            {figlie.length}
                          </span>
                        </button>
                      ) : (
                        <span className={s.copertina ? "cursor-default underline decoration-dotted decoration-gray-400" : ""}>
                          {s.odp || "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{s.numeroScheda || "—"}</td>
                    <td className="px-4 py-3 text-xs">{s.descrizioneFasi || "—"}</td>
                    <td className="px-4 py-3"><BadgeStato stato={s.statoProduzione} /></td>
                    <td className="px-4 py-3">{s.faseCorrente ? <BadgeStato stato={s.faseCorrente} /> : <span style={{ color: "var(--color-grey-icon)" }}>—</span>}</td>
                    <td className="px-4 py-3"><DataCell date={s.dataProduzionePrevista} inRitardo={ritardo.produzione} /></td>
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
                  {expanded && figlie.map((f) => {
                    const fRitardo = isInRitardo(f, today);
                    return (
                      <tr key={f.id} className="border-b last:border-0" style={{ background: "#FAFAF9" }}>
                        <td className="px-4 py-2 text-xs" style={{ color: "var(--color-grey-mid)" }}>{f.clienteInfo || "—"}</td>
                        <td className="px-4 py-2 pl-10 font-mono text-xs whitespace-nowrap" style={{ color: "var(--color-grey-mid)" }}>
                          ↳ {f.odp || "—"}
                        </td>
                        <td className="px-4 py-2 text-xs whitespace-nowrap">{f.numeroScheda || "—"}</td>
                        <td className="px-4 py-2 text-xs">{f.descrizioneFasi || "—"}</td>
                        <td className="px-4 py-2"><BadgeStato stato={f.statoProduzione} /></td>
                        <td className="px-4 py-2">{f.faseCorrente ? <BadgeStato stato={f.faseCorrente} /> : <span style={{ color: "var(--color-grey-icon)" }}>—</span>}</td>
                        <td className="px-4 py-2"><DataCell date={f.dataProduzionePrevista} inRitardo={fRitardo.produzione} /></td>
                        <td className="px-4 py-2 text-xs">{f.fornitore || "—"}</td>
                        <td className="px-4 py-2"><DataCell date={f.dataRientroPrevista} inRitardo={fRitardo.rientro} /></td>
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2"></td>
                      </tr>
                    );
                  })}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginazione */}
      {totalPages > 1 && (
        <div className="no-print flex items-center justify-between text-sm">
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

      {/* Intestazione di stampa — logo + titolo + filtri attivi */}
      <div className="print-header hidden">
        <div className="print-brand" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/modar-logo.png"
            alt="Modar"
            width={80}
            height={80}
            style={{ height: 80, width: 80, objectFit: "contain", background: "#000", borderRadius: 5, padding: 4, flexShrink: 0 }}
          />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "#1A1918" }}>MES DASHBOARD — RIEPILOGHI</span>
        </div>
        <div className="print-header-row">
          <h1>Schede di Produzione</h1>
          <div className="print-filters">
            <strong>Filtri:</strong> {filtriAttiviLabel}
          </div>
        </div>
        <div className="print-meta">
          {filtered.length} schede · stampato il {new Date().toLocaleDateString("it-IT")} alle {new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {/* Tabella di stampa — tutti i risultati filtrati, senza PDF/NAS/azioni */}
      <table className="print-table hidden">
        <thead>
          <tr>
            <th>Cliente / Commessa</th>
            <th>ODP</th>
            <th>N° Scheda</th>
            <th>Descrizione</th>
            <th>Stato</th>
            <th>Fase</th>
            <th>Data Prod. Prev.</th>
            <th>Fornitore</th>
            <th>Rientro Prev.</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s) => (
            <tr key={s.id}>
              <td>{s.clienteInfo || "—"}{s.commessaNr ? ` (${s.commessaNr})` : ""}</td>
              <td>{s.odp || "—"}</td>
              <td>{s.numeroScheda || "—"}</td>
              <td>{s.descrizioneFasi || "—"}</td>
              <td>{s.statoProduzione || "—"}</td>
              <td>{s.faseCorrente || "—"}</td>
              <td>{fmt(s.dataProduzionePrevista)}</td>
              <td>{s.fornitore || "—"}</td>
              <td>{fmt(s.dataRientroPrevista)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && <FormModificaScheda scheda={editing} onClose={() => setEditing(null)} onSave={handleSave} />}
      <CopertinaTooltip tooltip={tooltip} />
    </div>
  );
}
