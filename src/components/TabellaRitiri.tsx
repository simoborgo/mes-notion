"use client";

import { useState, useMemo, useEffect } from "react";
import type { Ritiro, Scheda } from "@/lib/types";
import BadgeStato from "./BadgeStato";
import FormModificaRitiro from "./FormModificaRitiro";
import FormNuovoRitiro from "./FormNuovoRitiro";

function DocLinks({ files, label }: { files: { name: string; url: string }[]; label: string }) {
  if (!files.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {files.map((d, i) => (
        <a
          key={i}
          href={d.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
          style={{ color: "var(--color-primary)" }}
        >
          <span>📎</span> {d.name || label}
        </a>
      ))}
    </div>
  );
}


// Transizioni di stato valide per ogni stato corrente
const TRANSIZIONI: Record<string, string[]> = {
  "Da Fare":  ["In corso", "Fatto"],
  "In corso": ["Fatto", "Da Fare"],
  "Fatto":    ["Da Fare"],
};

const TRANSIZIONE_BTN: Record<string, { bg: string; hoverBg: string; icon: string }> = {
  "Da Fare":  { bg: "#F59E0B", hoverBg: "#D97706", icon: "○" },
  "In corso": { bg: "#3B82F6", hoverBg: "#2563EB", icon: "▶" },
  "Fatto":    { bg: "#10B981", hoverBg: "#059669", icon: "✓" },
};

const STATO_BADGE: Record<string, { bg: string; text: string; border: string; blink?: boolean }> = {
  "Da Fare":  { bg: "#FEF3C7", text: "#92400E", border: "#F59E0B" },
  "In corso": { bg: "#DBEAFE", text: "#1E40AF", border: "#60A5FA", blink: true },
  "Fatto":    { bg: "#D1FAE5", text: "#065F46", border: "#34D399" },
};

const TIPO_CONFIG: Record<string, { bg: string; text: string; border: string; arrow: "in" | "out" }> = {
  "Ritiro":   { bg: "#EFF6FF", text: "#1D4ED8", border: "#93C5FD", arrow: "in" },
  "Consegna": { bg: "#FFF7ED", text: "#C2410C", border: "#FDBA74", arrow: "out" },
};

function TipoBadge({ tipo }: { tipo: string }) {
  const cfg = TIPO_CONFIG[tipo];
  if (!cfg) return <span className="text-sm">{tipo}</span>;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border font-semibold whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border, fontSize: "0.85rem" }}
    >
      {cfg.arrow === "in" ? (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M11 2L2 11M2 11h6M2 11V5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M2 11L11 2M11 2H5M11 2v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {tipo}
    </span>
  );
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

export default function TabellaRitiri({ ritiri: initial, schede = [], fornitori = [], userRole }: { ritiri: Ritiro[]; schede?: Scheda[]; fornitori?: { id: string; nome: string }[]; userRole?: string }) {
  const canWrite = userRole === "admin" || userRole === "operatore";
  const canDelete = userRole === "admin";
  const [ritiri, setRitiri] = useState(initial);
  const [search, setSearch] = useState("");
  const [filtroStato, setFiltroStato] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroData, setFiltroData] = useState("");
  const [filtroDataAbilitato, setFiltroDataAbilitato] = useState(false);
  const [filtroUrgente, setFiltroUrgente] = useState(false);
  const [editing, setEditing] = useState<Ritiro | null>(null);
  const [creando, setCreando] = useState(false);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [completedAt, setCompletedAt] = useState<Map<string, Date>>(new Map());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss toast dopo 4 secondi
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleStatoChange(id: string, nuovoStato: string) {
    const vecchioStato = ritiri.find((r) => r.id === id)?.stato ?? "";
    // Aggiornamento ottimistico immediato
    setRitiri((prev) => prev.map((r) => (r.id === id ? { ...r, stato: nuovoStato } : r)));
    if (nuovoStato === "Fatto") setCompletedAt((prev) => new Map(prev).set(id, new Date()));
    setLoadingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/ritiri/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: nuovoStato }),
      });
      if (!res.ok) throw new Error("Errore aggiornamento");
      const updated: Ritiro = await res.json();
      setRitiri((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch {
      // Ripristina lo stato precedente in caso di errore
      setRitiri((prev) => prev.map((r) => (r.id === id ? { ...r, stato: vecchioStato } : r)));
      setToast("Errore durante l'aggiornamento dello stato. Riprova.");
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const statiUniq = ["Da Fare", "In corso", "Fatto"];
  const tipiUniq  = ["Ritiro", "Consegna"];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return ritiri.filter((r) => {
      if (q && !`${r.causale} ${r.numeroOrdine} ${r.fornitore} ${r.descrizioneMerce}`.toLowerCase().includes(q)) return false;
      if (filtroStato && r.stato !== filtroStato) return false;
      if (filtroTipo && r.tipoMovimento !== filtroTipo) return false;
      if (filtroDataAbilitato && filtroData && r.dataTrasporto !== filtroData) return false;
      if (filtroUrgente && !r.urgenza) return false;
      return true;
    });
  }, [ritiri, search, filtroStato, filtroTipo, filtroData, filtroDataAbilitato, filtroUrgente]);

  const schedeMap = useMemo(() => new Map(schede.map(s => [s.id, s])), [schede]);

  const filteredAttivi = useMemo(() => filtered.filter(r => r.stato !== "Fatto"), [filtered]);
  const filteredFatti  = useMemo(() => filtered.filter(r => r.stato === "Fatto"),  [filtered]);

  // Solo quelli marcati come "Fatto" oggi in questa sessione
  const filteredFattiOggi = useMemo(() => {
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    return filteredFatti.filter(r => {
      const ts = completedAt.get(r.id);
      if (!ts) return false;
      const tsDay = new Date(ts);
      tsDay.setHours(0, 0, 0, 0);
      return tsDay.getTime() === oggi.getTime();
    });
  }, [filteredFatti, completedAt]);

  // Archivio: tutti i Fatto dal filtro attivo
  const archivioFatti = useMemo(() => filtered.filter(r => r.stato === "Fatto"), [filtered]);

  function handleSave(updated: Ritiro) {
    setRitiri((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setEditing(null);
  }

  function handleCreated(ritiro: Ritiro) {
    setRitiri((prev) => [ritiro, ...prev]);
    setCreando(false);
  }

  async function handleDelete(id: string) {
    setLoadingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/ritiri/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Errore eliminazione");
      setRitiri((prev) => prev.filter((r) => r.id !== id));
      setConfirmDelete(null);
    } catch {
      setToast("Errore durante l'eliminazione. Riprova.");
    } finally {
      setLoadingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  const inputCls = "border rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes ritiro-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0.15; }
        }
        .ritiro-blink { animation: ritiro-blink 2s step-start infinite; }
      `}</style>
      {/* Toast errore */}
      {toast && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium border"
          style={{ background: "#FEF2F2", color: "#991B1B", borderColor: "#FECACA" }}
          role="alert"
        >
          <span className="text-base leading-none">⚠</span>
          {toast}
          <button
            onClick={() => setToast(null)}
            className="ml-auto text-base leading-none opacity-60 hover:opacity-100"
            aria-label="Chiudi"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <input
          className={inputCls + " min-w-48"}
          placeholder="Cerca descrizione, fornitore…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={inputCls} value={filtroStato} onChange={(e) => setFiltroStato(e.target.value)}>
          <option value="">Tutti gli stati</option>
          {statiUniq.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={inputCls} value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
          <option value="">Tutti i tipi</option>
          {tipiUniq.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={filtroDataAbilitato}
            onChange={(e) => setFiltroDataAbilitato(e.target.checked)}
            className="accent-orange-500"
          />
          <input
            type="date"
            className={inputCls}
            value={filtroData}
            onChange={(e) => setFiltroData(e.target.value)}
            disabled={!filtroDataAbilitato}
            style={{ opacity: filtroDataAbilitato ? 1 : 0.4 }}
          />
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={filtroUrgente} onChange={(e) => setFiltroUrgente(e.target.checked)} className="accent-orange-500" />
          Solo urgenti
        </label>
        <span className="text-sm self-center" style={{ color: "var(--color-grey-mid)" }}>
          {filteredAttivi.length} attivi · {filteredFatti.length} completati
          {filteredFattiOggi.length > 0 && ` · ${filteredFattiOggi.length} completati oggi`}
        </span>
        {canWrite && (
          <button
            onClick={() => setCreando(true)}
            className="ml-auto flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white rounded transition-colors hover:opacity-90"
            style={{ background: "var(--color-primary)", borderRadius: "var(--radius-button)" }}
          >
            <span className="text-base leading-none">+</span> Nuovo ritiro
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full" style={{ fontSize: "0.95rem" }}>
          <thead>
            <tr className="border-b text-left text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <th className="px-3 py-4"></th>
              <th className="px-4 py-4">ODP</th>
              <th className="px-4 py-4">Scheda</th>
              <th className="px-4 py-4">Descrizione</th>
              <th className="px-4 py-4">Tipo</th>
              <th className="px-4 py-4">Stato</th>
              <th className="px-4 py-4">Fornitore</th>
              <th className="px-4 py-4">Ordine OF</th>
              <th className="px-4 py-4">PDF Scheda</th>
              <th className="px-4 py-4">Foto</th>
              <th className="px-4 py-4">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {filteredAttivi.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-14 text-center" style={{ color: "var(--color-grey-mid)", fontSize: "0.95rem" }}>
                  Nessun movimento attivo
                </td>
              </tr>
            ) : (
              (() => {
                const groupMap = new Map<string, { dateKey: string; label: string; items: Ritiro[] }>();
                for (const r of filteredAttivi) {
                  const dateKey = r.dataTrasporto ?? "senza-data";
                  if (!groupMap.has(dateKey)) {
                    let label: string;
                    if (dateKey === "senza-data") {
                      label = "Senza data";
                    } else {
                      const raw = new Date(dateKey).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
                      label = raw.charAt(0).toUpperCase() + raw.slice(1);
                    }
                    groupMap.set(dateKey, { dateKey, label, items: [] });
                  }
                  groupMap.get(dateKey)!.items.push(r);
                }
                const groups = Array.from(groupMap.values()).sort((a, b) => {
                  if (a.dateKey === "senza-data") return 1;
                  if (b.dateKey === "senza-data") return -1;
                  return a.dateKey.localeCompare(b.dateKey);
                });
                return groups.flatMap(({ dateKey, label, items }) => [
                  <tr key={`day-${dateKey}`} style={{ background: "#f5f4f0" }}>
                    <td colSpan={11} className="px-5 py-2">
                      <span className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>
                        {label}
                      </span>
                    </td>
                  </tr>,
                  ...items.map((r) => {
                    const isLoading = loadingIds.has(r.id);
                    const transizioniPossibili = TRANSIZIONI[r.stato] ?? [];
                    const statoBadge = STATO_BADGE[r.stato];
                    const scheda = r.numeroOrdineId ? schedeMap.get(r.numeroOrdineId) : null;
                    return (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-orange-50/30 transition-colors" style={r.nc ? { borderLeft: "3px solid #DC2626" } : {}}>
                        <td className="px-3 py-4">
                          <div className="flex flex-col gap-1.5">
                            {canWrite && transizioniPossibili.map((stato) => {
                              const btn = TRANSIZIONE_BTN[stato] ?? { bg: "#6B7280", hoverBg: "#4B5563", icon: "→" };
                              return (
                                <button
                                  key={stato}
                                  disabled={isLoading}
                                  onClick={() => handleStatoChange(r.id, stato)}
                                  className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-md active:scale-95"
                                  style={{ background: btn.bg, minWidth: 80, letterSpacing: "0.01em" }}
                                  title={`Segna come ${stato}`}
                                >
                                  {isLoading ? (
                                    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <span className="text-[0.65rem] leading-none">{btn.icon}</span>
                                  )}
                                  {stato}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-4 tabular-nums font-medium whitespace-nowrap">{r.numeroOrdine || "—"}</td>
                        <td className="px-4 py-4">
                          {scheda ? (
                            <div>
                              <span className="font-semibold tabular-nums" style={{ color: "var(--color-black)" }}>
                                {scheda.numeroScheda || scheda.odp}
                              </span>
                              {scheda.clienteInfo && <div className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>{scheda.clienteInfo}</div>}
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-4 font-semibold" style={{ color: "var(--color-black)" }}>{r.descrizioneMerce || "—"}</td>
                        <td className="px-4 py-4">
                          {r.tipoMovimento ? <TipoBadge tipo={r.tipoMovimento} /> : "—"}
                        </td>
                        <td className="px-4 py-4">
                          {statoBadge ? (
                            <span
                              className="inline-flex items-center px-3 py-1 rounded-full border font-semibold whitespace-nowrap"
                              style={{
                                background: statoBadge.bg,
                                color: statoBadge.text,
                                borderColor: statoBadge.border,
                                fontSize: "0.85rem",
                              }}
                            >
                              <span className={statoBadge.blink ? "ritiro-blink" : ""}>{r.stato}</span>
                            </span>
                          ) : (
                            <BadgeStato stato={r.stato} />
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div>
                            {r.urgenza && (
                              <div className="mb-0.5">
                                <span className="inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: "#FEE2E2", color: "#DC2626" }}>
                                  ⚠ Urgente
                                </span>
                              </div>
                            )}
                            <div style={{ color: r.fornitore ? "var(--color-black)" : "var(--color-grey-icon)" }}>
                              {r.fornitore || "—"}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-1">
                            <DocLinks files={r.ordineFornitore} label="OF" />
                            <DocLinks files={scheda?.pdfOrdineFornitore ?? []} label="PDF OF" />
                            {!r.ordineFornitore.length && !(scheda?.pdfOrdineFornitore?.length) && (
                              <span style={{ color: "var(--color-grey-icon)" }}>—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <DocLinks files={scheda?.pdfAllegato ?? []} label="PDF Scheda" />
                          {!(scheda?.pdfAllegato?.length) && <span style={{ color: "var(--color-grey-icon)" }}>—</span>}
                        </td>
                        <td className="px-4 py-4">
                          {r.foto.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {r.foto.map((f, i) => (
                                <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" title={f.name || `Foto ${i + 1}`}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={f.url}
                                    alt={f.name || `Foto ${i + 1}`}
                                    className="rounded object-cover hover:opacity-80 transition-opacity"
                                    style={{ width: 36, height: 36, border: "1px solid #e5e4e0" }}
                                  />
                                </a>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: "var(--color-grey-icon)" }}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {canWrite && (
                              <button
                                onClick={() => setEditing(r)}
                                className="font-semibold px-3 py-1 rounded transition-colors hover:opacity-80"
                                style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", fontSize: "0.8rem", borderRadius: "var(--radius-badge)" }}
                              >
                                Modifica
                              </button>
                            )}
                            {canDelete && (
                              confirmDelete === r.id ? (
                                <span className="inline-flex items-center gap-1">
                                  <button
                                    onClick={() => handleDelete(r.id)}
                                    disabled={isLoading}
                                    className="font-semibold px-3 py-1 rounded text-white transition-colors disabled:opacity-40"
                                    style={{ background: "#DC2626", fontSize: "0.8rem", borderRadius: "var(--radius-badge)" }}
                                  >
                                    Conferma
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete(null)}
                                    className="font-semibold px-2 py-1 rounded transition-colors"
                                    style={{ color: "#6B7280", background: "#F3F4F6", fontSize: "0.8rem", borderRadius: "var(--radius-badge)" }}
                                  >
                                    ✕
                                  </button>
                                </span>
                              ) : (
                                <button
                                  onClick={() => setConfirmDelete(r.id)}
                                  className="font-semibold px-3 py-1 rounded transition-colors hover:opacity-80"
                                  style={{ color: "#DC2626", background: "rgba(220,38,38,0.07)", fontSize: "0.8rem", borderRadius: "var(--radius-badge)" }}
                                >
                                  Elimina
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }),
                ]);
              })()
            )}
          </tbody>
        </table>
      </div>

      {/* ── Movimenti completati oggi ── */}
      {filteredFattiOggi.length > 0 && (
        <div className="mt-14">
          <h2 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-grey-mid)" }}>
            Completati oggi ({filteredFattiOggi.length})
          </h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full" style={{ fontSize: "0.95rem" }}>
              <thead>
                <tr className="border-b text-left text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
                  <th className="px-3 py-4"></th>
                  <th className="px-4 py-4">ODP</th>
                  <th className="px-4 py-4">Scheda</th>
                  <th className="px-4 py-4">Descrizione</th>
                  <th className="px-4 py-4">Tipo</th>
                  <th className="px-4 py-4">Stato</th>
                      <th className="px-4 py-4">Fornitore</th>
                  <th className="px-4 py-4">Ordine OF</th>
                  <th className="px-4 py-4">PDF Scheda</th>
                  <th className="px-4 py-4">Foto</th>
                  <th className="px-4 py-4">Completato il</th>
                </tr>
              </thead>
              <tbody>
                {filteredFattiOggi.map((r) => {
                  const statoBadge = STATO_BADGE[r.stato];
                  const scheda = r.numeroOrdineId ? schedeMap.get(r.numeroOrdineId) : null;
                  const ts = completedAt.get(r.id);
                  return (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-orange-50/30 transition-colors">
                      <td className="px-3 py-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <span
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold"
                            style={{ background: "#D1FAE5", color: "#065F46" }}
                          >✓</span>
                          {canWrite && (
                            <button
                              onClick={() => handleStatoChange(r.id, "In corso")}
                              disabled={loadingIds.has(r.id)}
                              title="Riapri — annulla completamento"
                              className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold transition-colors hover:opacity-80 disabled:opacity-40"
                              style={{ background: "#FEF3C7", color: "#92400E" }}
                            >↩</button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 tabular-nums font-medium">{r.numeroOrdine || "—"}</td>
                      <td className="px-4 py-4">
                        {scheda ? (
                          <div>
                            <span className="font-semibold tabular-nums" style={{ color: "var(--color-black)" }}>
                              {scheda.numeroScheda || scheda.odp}
                            </span>
                            {scheda.clienteInfo && <div className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>{scheda.clienteInfo}</div>}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-4 font-semibold" style={{ color: "var(--color-black)" }}>{r.descrizioneMerce || "—"}</td>
                      <td className="px-4 py-4">
                        {r.tipoMovimento ? <TipoBadge tipo={r.tipoMovimento} /> : "—"}
                      </td>
                      <td className="px-4 py-4">
                        {statoBadge ? (
                          <span
                            className="inline-flex items-center px-3 py-1 rounded-full border font-semibold whitespace-nowrap"
                            style={{ background: statoBadge.bg, color: statoBadge.text, borderColor: statoBadge.border, fontSize: "0.85rem" }}
                          >
                            <span>{r.stato}</span>
                          </span>
                        ) : (
                          <BadgeStato stato={r.stato} />
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          {r.urgenza && (
                            <div className="inline-flex items-center gap-1 text-xs font-bold mb-0.5" style={{ color: "#DC2626" }}>
                              <span>⚠</span> Urgente
                            </div>
                          )}
                          <div style={{ color: r.fornitore ? "var(--color-black)" : "var(--color-grey-icon)" }}>
                            {r.fornitore || "—"}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                          <DocLinks files={r.ordineFornitore} label="OF" />
                          <DocLinks files={r.pdfOrdineFornitore} label="PDF OF" />
                          {!r.ordineFornitore.length && !r.pdfOrdineFornitore.length && (
                            <span style={{ color: "var(--color-grey-icon)" }}>—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <DocLinks files={scheda?.pdfAllegato ?? []} label="PDF Scheda" />
                        {!(scheda?.pdfAllegato?.length) && <span style={{ color: "var(--color-grey-icon)" }}>—</span>}
                      </td>
                      <td className="px-4 py-4">
                        {r.foto.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {r.foto.map((f, i) => (
                              <a
                                key={i}
                                href={f.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                                style={{ color: "var(--color-primary)" }}
                              >
                                <span>🖼</span> {f.name || `Foto ${i + 1}`}
                              </a>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: "var(--color-grey-icon)" }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 tabular-nums text-sm" style={{ color: ts ? "var(--color-black)" : "var(--color-grey-icon)" }}>
                        {ts ? (
                          <div>
                            <div>{ts.toLocaleDateString("it-IT")}</div>
                            <div className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
                              {ts.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Archivio completati ── */}
      <div className="mt-6 pb-4">
        <h2 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: "var(--color-grey-mid)" }}>
          Archivio completati ({archivioFatti.length})
        </h2>
        {archivioFatti.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessun movimento completato.</p>
        ) : (
          <ul className="space-y-1.5">
            {archivioFatti.map((r) => {
              const statoBadge = STATO_BADGE[r.stato];
              return (
                <li key={r.id} className="flex items-center gap-3 text-sm">
                  <span className="w-4 h-4 flex-shrink-0 rounded border-2 flex items-center justify-center" style={{ borderColor: statoBadge?.border ?? "#D1D5DB" }}>
                    {r.stato === "Fatto" && (
                      <svg className="w-2.5 h-2.5" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke={statoBadge?.text ?? "#374151"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="tabular-nums font-medium" style={{ color: "var(--color-grey-mid)", minWidth: 70 }}>{fmt(r.dataTrasporto)}</span>
                  <span className="font-semibold" style={{ color: "var(--color-black)" }}>{r.descrizioneMerce || r.causale || "—"}</span>
                  {r.tipoMovimento && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#6B7280" }}>{r.tipoMovimento}</span>
                  )}
                  {r.fornitore && (
                    <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{r.fornitore}</span>
                  )}
                  {statoBadge && (
                    <span
                      className="ml-auto text-xs px-2 py-0.5 rounded-full border font-semibold"
                      style={{ background: statoBadge.bg, color: statoBadge.text, borderColor: statoBadge.border }}
                    >
                      {r.stato}
                    </span>
                  )}
                  {canWrite && (
                    <button
                      onClick={() => handleStatoChange(r.id, "In corso")}
                      disabled={loadingIds.has(r.id)}
                      title="Riapri — annulla completamento"
                      className="text-xs px-2 py-0.5 rounded border font-medium transition-colors hover:opacity-80 disabled:opacity-40"
                      style={{ background: "#FEF3C7", color: "#92400E", borderColor: "#FCD34D" }}
                    >↩ Riapri</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {creando && (
        <FormNuovoRitiro
          schede={schede}
          fornitori={fornitori}
          onClose={() => setCreando(false)}
          onCreated={handleCreated}
        />
      )}
      {editing && (
        <FormModificaRitiro
          ritiro={editing}
          schede={schede}
          fornitori={fornitori}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
