"use client";

import { Fragment, useMemo, useState } from "react";
import type { Cassa, Commessa, Scheda } from "@/lib/types";
import BadgeStato from "./BadgeStato";
import FormCassa from "./FormCassa";

const STATI_CASSA = ["Da preparare", "Pronta", "Caricata"];

interface Props {
  casse: Cassa[];
  commesse: Commessa[];
  schede: Scheda[];
  canWrite: boolean;
}

export default function TabellaCasse({ casse: initial, commesse, schede, canWrite }: Props) {
  const [casse, setCasse] = useState(initial);
  const [commessaId, setCommessaId] = useState("");
  const [creando, setCreando] = useState(false);
  const [editing, setEditing] = useState<Cassa | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const commesseConCasseOSchede = useMemo(() => {
    const ids = new Set<string>();
    casse.forEach(c => ids.add(c.commessaId));
    schede.forEach(s => { if (s.statoProduzione === "Completato" && s.commessaId) ids.add(s.commessaId); });
    return commesse.filter(c => ids.has(c.id)).sort((a, b) => a.numeroCommessa.localeCompare(b.numeroCommessa));
  }, [casse, schede, commesse]);

  const commessaSelezionata = commesse.find(c => c.id === commessaId) ?? null;

  const schedeMap = useMemo(() => new Map(schede.map(s => [s.id, s])), [schede]);

  const casseDellaCommessa = useMemo(
    () => casse.filter(c => c.commessaId === commessaId).sort((a, b) => a.numero - b.numero),
    [casse, commessaId]
  );

  // Id Scheda -> in quali Casse (di QUALSIASI commessa) è già assegnata — per il badge "già in
  // altra cassa" nel form, dato che una Scheda può stare su più casse.
  const casseIdsPerScheda = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of casse) {
      for (const r of c.schede) {
        const arr = map.get(r.schedaId) ?? [];
        arr.push(c.id);
        map.set(r.schedaId, arr);
      }
    }
    return map;
  }, [casse]);

  const schedeCompletateDellaCommessa = useMemo(
    () => schede.filter(s => s.commessaId === commessaId && s.statoProduzione === "Completato"),
    [schede, commessaId]
  );

  const schedeIdsAssegnateInQuestaCommessa = useMemo(() => {
    const ids = new Set<string>();
    casseDellaCommessa.forEach(c => c.schede.forEach(r => ids.add(r.schedaId)));
    return ids;
  }, [casseDellaCommessa]);

  const schedeNonAncoraInCassa = useMemo(
    () => schedeCompletateDellaCommessa.filter(s => !schedeIdsAssegnateInQuestaCommessa.has(s.id)),
    [schedeCompletateDellaCommessa, schedeIdsAssegnateInQuestaCommessa]
  );

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCreated(cassa: Cassa) {
    setCasse(prev => [...prev, cassa]);
    setCreando(false);
  }

  function handleSave(updated: Cassa) {
    setCasse(prev => prev.map(c => (c.id === updated.id ? updated : c)));
    setEditing(null);
  }

  async function handleStatoChange(cassa: Cassa, stato: string) {
    setLoadingIds(prev => new Set(prev).add(cassa.id));
    try {
      const res = await fetch(`/api/casse/${cassa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato }),
      });
      if (!res.ok) throw new Error();
      const updated: Cassa = await res.json();
      setCasse(prev => prev.map(c => (c.id === updated.id ? updated : c)));
    } catch {
      setToast("Errore aggiornamento stato. Riprova.");
    } finally {
      setLoadingIds(prev => { const next = new Set(prev); next.delete(cassa.id); return next; });
    }
  }

  async function handleDelete(id: string) {
    setLoadingIds(prev => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/casse/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setCasse(prev => prev.filter(c => c.id !== id));
      setConfirmDelete(null);
    } catch {
      setToast("Errore durante l'eliminazione. Riprova.");
    } finally {
      setLoadingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  }

  const inputCls = "border rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

  return (
    <div className="space-y-3">
      {toast && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium border" style={{ background: "#FEF2F2", color: "#991B1B", borderColor: "#FECACA" }} role="alert">
          <span className="text-base leading-none">⚠</span>
          {toast}
          <button onClick={() => setToast(null)} className="ml-auto text-base leading-none opacity-60 hover:opacity-100" aria-label="Chiudi">×</button>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <select className={inputCls + " min-w-64"} value={commessaId} onChange={e => setCommessaId(e.target.value)}>
          <option value="">— Seleziona una Commessa —</option>
          {commesseConCasseOSchede.map(c => (
            <option key={c.id} value={c.id}>{c.numeroCommessa} — {c.cliente}</option>
          ))}
        </select>
        {commessaId && canWrite && (
          <button
            onClick={() => setCreando(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white rounded transition-colors hover:opacity-90"
            style={{ background: "var(--color-primary)", borderRadius: "var(--radius-button)" }}
          >
            <span className="text-base leading-none">+</span> Nuova cassa
          </button>
        )}
      </div>

      {!commessaId ? (
        <p className="text-sm py-8 text-center" style={{ color: "var(--color-grey-mid)" }}>
          Seleziona una Commessa per vedere le sue casse — l&apos;elenco sopra mostra solo le
          Commesse con almeno una Scheda &quot;Completato&quot; o una cassa già creata.
        </p>
      ) : (
        <>
          {schedeNonAncoraInCassa.length > 0 && (
            <div className="rounded-lg border p-3" style={{ borderColor: "#FCD34D", background: "#FFFBEB" }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#92400E" }}>
                Schede pronte, non ancora in nessuna cassa ({schedeNonAncoraInCassa.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {schedeNonAncoraInCassa.map(s => (
                  <span key={s.id} className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: "white", color: "#92400E", border: "1px solid #FCD34D" }}>
                    {s.odp}{s.numeroScheda ? ` — ${s.numeroScheda}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
                  <th className="px-4 py-3">Cassa</th>
                  <th className="px-4 py-3">Descrizione</th>
                  <th className="px-4 py-3">Stato</th>
                  <th className="px-4 py-3 text-right">Schede</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {casseDellaCommessa.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                      Nessuna cassa creata per questa Commessa
                    </td>
                  </tr>
                ) : (
                  casseDellaCommessa.map(c => {
                    const isLoading = loadingIds.has(c.id);
                    const expanded = expandedIds.has(c.id);
                    return (
                      <Fragment key={c.id}>
                        <tr className="border-b last:border-0 hover:bg-orange-50/30 transition-colors">
                          <td className="px-4 py-3 font-semibold cursor-pointer" onClick={() => toggleExpand(c.id)}>
                            <span className="mr-1.5" style={{ color: "var(--color-grey-mid)" }}>{expanded ? "▾" : "▸"}</span>
                            Cassa {c.numero}
                          </td>
                          <td className="px-4 py-3">{c.descrizione || "—"}</td>
                          <td className="px-4 py-3">
                            {canWrite ? (
                              <select
                                className="text-xs border rounded px-1.5 py-1"
                                value={c.stato}
                                disabled={isLoading}
                                onChange={e => handleStatoChange(c, e.target.value)}
                              >
                                {STATI_CASSA.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            ) : (
                              <BadgeStato stato={c.stato} />
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">{c.schede.length}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 justify-end">
                              {canWrite && (
                                <button
                                  onClick={() => setEditing(c)}
                                  className="font-semibold px-3 py-1 rounded transition-colors hover:opacity-80 whitespace-nowrap"
                                  style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", fontSize: "0.8rem", borderRadius: "var(--radius-badge)" }}
                                >
                                  Modifica
                                </button>
                              )}
                              {canWrite && (
                                confirmDelete === c.id ? (
                                  <span className="inline-flex items-center gap-1">
                                    <button
                                      onClick={() => handleDelete(c.id)}
                                      disabled={isLoading}
                                      className="font-semibold px-3 py-1 rounded text-white transition-colors disabled:opacity-40 whitespace-nowrap"
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
                                    onClick={() => setConfirmDelete(c.id)}
                                    className="font-semibold px-3 py-1 rounded transition-colors hover:opacity-80 whitespace-nowrap"
                                    style={{ color: "#DC2626", background: "rgba(220,38,38,0.07)", fontSize: "0.8rem", borderRadius: "var(--radius-badge)" }}
                                  >
                                    Elimina
                                  </button>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-b last:border-0" style={{ background: "#FAF9F7" }}>
                            <td colSpan={5} className="px-4 py-3">
                              {c.schede.length === 0 ? (
                                <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>Nessuna scheda assegnata.</p>
                              ) : (
                                <ul className="space-y-1">
                                  {c.schede.map(r => {
                                    const s = schedeMap.get(r.schedaId);
                                    const altreCasse = (casseIdsPerScheda.get(r.schedaId) ?? []).filter(id => id !== c.id);
                                    return (
                                      <li key={r.schedaId} className="text-xs flex items-center gap-2">
                                        <span className="font-medium">{s ? `${s.odp}${s.numeroScheda ? ` — ${s.numeroScheda}` : ""}` : r.schedaId}</span>
                                        {r.note && <span style={{ color: "var(--color-grey-mid)" }}>· {r.note}</span>}
                                        {altreCasse.length > 0 && (
                                          <span className="px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#FEF3C7", color: "#92400E" }}>
                                            anche in {altreCasse.length} altra{altreCasse.length > 1 ? "e" : ""} cassa{altreCasse.length > 1 ? "e" : ""}
                                          </span>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {creando && commessaSelezionata && (
        <FormCassa
          commessaId={commessaSelezionata.id}
          commessaLabel={`${commessaSelezionata.numeroCommessa} — ${commessaSelezionata.cliente}`}
          schedeDisponibili={schedeCompletateDellaCommessa}
          schedeAltreCasse={new Set([...casseIdsPerScheda.keys()])}
          onClose={() => setCreando(false)}
          onSave={handleCreated}
        />
      )}
      {editing && commessaSelezionata && (
        <FormCassa
          cassa={editing}
          commessaId={commessaSelezionata.id}
          commessaLabel={`${commessaSelezionata.numeroCommessa} — ${commessaSelezionata.cliente}`}
          schedeDisponibili={schedeCompletateDellaCommessa}
          schedeAltreCasse={new Set([...casseIdsPerScheda.keys()].filter(id => !editing!.schede.some(r => r.schedaId === id)))}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
