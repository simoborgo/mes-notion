"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Scheda } from "@/lib/types";
import { MODIFICA_SCHEDA_ROLES, type Role } from "@/lib/roles";
import BadgeStato from "./BadgeStato";
import DettaglioSchedaModal from "./DettaglioSchedaModal";
import ModaleOrdineFornitore from "./ModaleOrdineFornitore";
import ModaleAnteprimaScheda from "./ModaleAnteprimaScheda";

type SortKey = "dataRientroPrevista" | "dataUscitaMateriale" | "odp" | "fornitore";
type SortDir = "asc" | "desc";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

function DataCell({ date, inRitardo }: { date: string | null; inRitardo: boolean }) {
  if (!date) return <span style={{ color: "var(--color-grey-icon)" }}>—</span>;
  if (inRitardo) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-base font-semibold tabular-nums"
        style={{ background: "#FEE2E2", color: "#991B1B" }}
      >
        ⚠ {fmt(date)}
      </span>
    );
  }
  return <span className="tabular-nums whitespace-nowrap">{fmt(date)}</span>;
}

// Data di rientro previsto modificabile sul posto: clic → selettore data, Invio/uscita dal campo
// salva, Esc annulla. Vuoto = data rimossa.
function DataRientroEditabile({ date, inRitardo, canEdit, onSalva }: {
  date: string | null; inRitardo: boolean; canEdit: boolean; onSalva: (v: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [valore, setValore] = useState(date ?? "");
  const [saving, setSaving] = useState(false);

  if (!canEdit) return <DataCell date={date} inRitardo={inRitardo} />;

  async function conferma() {
    setEditing(false);
    if ((valore || null) === date) return;
    setSaving(true);
    try { await onSalva(valore || null); } finally { setSaving(false); }
  }

  if (editing) {
    return (
      <input
        type="date" autoFocus value={valore}
        onChange={(e) => setValore(e.target.value)}
        onBlur={conferma}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setValore(date ?? ""); setEditing(false); }
        }}
        className="px-2 py-1 rounded-lg border text-[17px]"
        style={{ borderColor: "var(--color-primary)" }}
      />
    );
  }
  return (
    <button
      type="button" disabled={saving} title="Clicca per modificare la data"
      onClick={() => { setValore(date ?? ""); setEditing(true); }}
      className="rounded-lg px-1 -mx-1 py-0.5 border border-transparent hover:border-orange-300 hover:bg-orange-50 transition-colors disabled:opacity-50"
    >
      {saving ? <span className="text-base">Salvo…</span> : <DataCell date={date} inRitardo={inRitardo} />}
    </button>
  );
}

const ICONA_USCITA = <path d="M5 12h14M13 6l6 6-6 6" />;
const ICONA_RIENTRO = <path d="M19 12H5M11 6l-6 6 6 6" />;

function BottoneMovimento({ label, tipo, onClick }: { label: string; tipo: "uscita" | "rientro"; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className="inline-flex items-center gap-1.5 text-base font-semibold px-2.5 py-1 rounded-lg border whitespace-nowrap"
      style={{ color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.3)", background: "rgba(240,143,37,0.06)" }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {tipo === "uscita" ? ICONA_USCITA : ICONA_RIENTRO}
      </svg>
      {label}
    </button>
  );
}

function Th({ label, k, sortKey, sortDir, onSort }: { label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void }) {
  const active = sortKey === k;
  return (
    <th className="px-4 py-3.5 whitespace-nowrap cursor-pointer select-none" onClick={() => onSort(k)}>
      {label}
      <span className="ml-1 inline-block text-[10px] opacity-60">
        {active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
      </span>
    </th>
  );
}

export default function TabellaLavorazioniEsterne({
  sottoschede,
  schede,
  userRole,
  revalidate,
}: {
  sottoschede: Scheda[];
  schede: Scheda[];
  userRole?: Role;
  revalidate?: () => Promise<void>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Risolve la scheda radice (tipologia 'Scheda') risalendo la catena parentId — una
  // sottoscheda può anche essere figlia di un'altra sottoscheda (rilavorazione).
  const byId = useMemo(() => {
    const map = new Map<string, Scheda>();
    for (const s of schede) map.set(s.id, s);
    for (const s of sottoschede) map.set(s.id, s);
    return map;
  }, [schede, sottoschede]);

  function schedaRadice(s: Scheda): Scheda | null {
    let cur = s;
    let guard = 0;
    while (cur.parentId && guard++ < 10) {
      const parent = byId.get(cur.parentId);
      if (!parent) break;
      cur = parent;
    }
    return cur.id !== s.id ? cur : null;
  }

  const canEdit = !!userRole && MODIFICA_SCHEDA_ROLES.includes(userRole);

  // Modifiche in-table: restano visibili subito, finché non arrivano i dati riletti dal server.
  const [propsPrec, setPropsPrec] = useState(sottoschede);
  const [agg, setAgg] = useState<Record<string, Scheda>>({});
  if (propsPrec !== sottoschede) { setPropsPrec(sottoschede); setAgg({}); }

  const esterne = useMemo(
    () => sottoschede.map((s) => agg[s.id] ?? s).filter((s) => s.produzioneEsterna),
    [sottoschede, agg]
  );

  const fornitoriUniq = useMemo(
    () => Array.from(new Set(esterne.map((s) => s.fornitore).filter(Boolean))).sort() as string[],
    [esterne]
  );
  const statiUniq = useMemo(
    () => Array.from(new Set(esterne.map((s) => s.statoProdEsterna).filter(Boolean))).sort(),
    [esterne]
  );

  const [search, setSearch] = useState("");
  const [filtroFornitore, setFiltroFornitore] = useState("");
  const [filtroStato, setFiltroStato] = useState("");
  const [nascondiRientrate, setNascondiRientrate] = useState(true);
  const [soloRitardo, setSoloRitardo] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("dataRientroPrevista");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [viewing, setViewing] = useState<Scheda | null>(null);
  const [ordineId, setOrdineId] = useState<string | null>(null);
  const [anteprima, setAnteprima] = useState<Scheda | null>(null);
  const [errore, setErrore] = useState("");

  function inRitardo(s: Scheda): boolean {
    return (
      s.statoProdEsterna !== "Rientrato" &&
      !s.dataRientroEffettiva &&
      !!s.dataRientroPrevista &&
      s.dataRientroPrevista < today
    );
  }

  function passaFiltri(s: Scheda): boolean {
    const q = search.toLowerCase();
    if (nascondiRientrate && s.statoProdEsterna === "Rientrato") return false;
    if (soloRitardo && !inRitardo(s)) return false;
    if (filtroFornitore && s.fornitore !== filtroFornitore) return false;
    if (filtroStato && s.statoProdEsterna !== filtroStato) return false;
    if (q && !`${s.odp} ${s.clienteInfo} ${s.numeroScheda} ${s.commessaNr} ${s.fornitore}`.toLowerCase().includes(q)) return false;
    return true;
  }

  // Righe che dopo un'uscita/rientro non passano più i filtri: restano un istante, in dissolvenza.
  const [uscenti, setUscenti] = useState<Set<string>>(new Set());
  function faiUscire(id: string) {
    setUscenti((u) => new Set(u).add(id));
    setTimeout(() => setUscenti((u) => { const n = new Set(u); n.delete(id); return n; }), 800);
  }

  const filtered = useMemo(() => {
    return esterne
      .filter((s) => uscenti.has(s.id) || passaFiltri(s))
      .sort((a, b) => {
        const va = (a[sortKey] as string) ?? "";
        const vb = (b[sortKey] as string) ?? "";
        const res = va < vb ? -1 : va > vb ? 1 : 0;
        return sortDir === "asc" ? res : -res;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esterne, search, filtroFornitore, filtroStato, nascondiRientrate, soloRitardo, sortKey, sortDir, today, uscenti]);

  const conteggioRitardo = useMemo(() => esterne.filter((s) => inRitardo(s)).length, [esterne, today]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleReload() {
    if (!revalidate) return;
    startTransition(async () => { await revalidate(); router.refresh(); });
  }

  function handleSchedaAggiornata(updated: Scheda) {
    setViewing(updated);
    setAgg((a) => ({ ...a, [updated.id]: updated }));
    handleReload();
  }

  // PATCH sulla scheda: il server scrive la data sul giro attivo e ricopia il riepilogo sulla scheda.
  async function salvaRientroPrevisto(s: Scheda, valore: string | null) {
    setErrore("");
    try {
      const res = await fetch(`/api/schede/${s.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataRientroPrevista: valore }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Salvataggio non riuscito");
      setAgg((a) => ({ ...a, [s.id]: data as Scheda }));
      handleReload();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Salvataggio non riuscito");
    }
  }

  // Uscita / rientro in un clic, con conferma: aggiorna stato e data effettiva del giro attivo
  // senza dover aprire la scheda e salvare.
  async function segnaMovimento(s: Scheda, tipo: "uscita" | "rientro") {
    const etichetta = tipo === "uscita" ? "uscita" : "rientro";
    const dove = `${s.odp || s.numeroScheda || "scheda"}${s.fornitore ? ` (${s.fornitore})` : ""}`;
    if (!confirm(`Segnare ${etichetta} oggi per ${dove}?`)) return;
    setErrore("");
    const oggi = new Date();
    const data = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}-${String(oggi.getDate()).padStart(2, "0")}`;
    const body = tipo === "uscita"
      ? { statoProdEsterna: "In Lavorazione", dataUscitaMateriale: s.dataUscitaMateriale || data }
      : { statoProdEsterna: "Rientrato", dataRientroEffettiva: s.dataRientroEffettiva || data };
    try {
      const res = await fetch(`/api/schede/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out?.error ?? "Salvataggio non riuscito");
      setAgg((a) => ({ ...a, [s.id]: out as Scheda }));
      if (!passaFiltri(out as Scheda)) faiUscire(s.id);
      handleReload();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Salvataggio non riuscito");
    }
  }

  function handleOrdineAggiornato(updated: Scheda) {
    setAgg((a) => ({ ...a, [updated.id]: updated }));
    handleReload();
  }
  const schedaOrdine = ordineId ? esterne.find((s) => s.id === ordineId) ?? null : null;

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="Cerca ODP, cliente, commessa, fornitore…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2.5 rounded-lg text-[17px] border"
          style={{ borderColor: "#E4E0DA", minWidth: 220 }}
        />
        <select
          value={filtroFornitore}
          onChange={(e) => setFiltroFornitore(e.target.value)}
          className="px-3 py-2.5 rounded-lg text-[17px] border"
          style={{ borderColor: "#E4E0DA" }}
        >
          <option value="">Tutti i fornitori</option>
          {fornitoriUniq.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select
          value={filtroStato}
          onChange={(e) => setFiltroStato(e.target.value)}
          className="px-3 py-2.5 rounded-lg text-[17px] border"
          style={{ borderColor: "#E4E0DA" }}
        >
          <option value="">Tutti gli stati</option>
          {statiUniq.map((st) => <option key={st} value={st}>{st}</option>)}
        </select>
        <button
          onClick={() => setNascondiRientrate((v) => !v)}
          className="px-3 py-2.5 rounded-lg text-[17px] font-semibold border transition-colors"
          style={
            nascondiRientrate
              ? { background: "var(--color-primary)", color: "white", borderColor: "var(--color-primary)" }
              : { background: "white", color: "var(--color-grey-mid)", borderColor: "#E4E0DA" }
          }
        >
          Nascondi rientrate
        </button>
        <button
          onClick={() => setSoloRitardo((v) => !v)}
          className="px-3 py-2.5 rounded-lg text-[17px] font-semibold border transition-colors"
          style={
            soloRitardo
              ? { background: "#DC2626", color: "white", borderColor: "#DC2626" }
              : { background: "white", color: "var(--color-grey-mid)", borderColor: "#E4E0DA" }
          }
        >
          ⚠ Rientro in ritardo ({conteggioRitardo})
        </button>
        <span className="text-base ml-auto" style={{ color: "var(--color-grey-mid)" }}>
          {filtered.length} su {esterne.length} sottoschede in produzione esterna
        </span>
      </div>

      {errore && <p className="text-base font-medium mb-2" style={{ color: "#DC2626" }}>{errore}</p>}

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "#E4E0DA" }}>
        <table className="w-full text-[17px]">
          <thead>
            <tr className="text-left border-b" style={{ background: "#FAFAF9", borderColor: "#E4E0DA", color: "var(--color-grey-mid)" }}>
              <th className="px-4 py-3.5 whitespace-nowrap">Cliente / Commessa</th>
              <Th label="ODP" k="odp" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3.5 whitespace-nowrap">Numero Scheda</th>
              <Th label="Fornitore" k="fornitore" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3.5 whitespace-nowrap">Stato</th>
              <th className="px-4 py-3.5 whitespace-nowrap">Ordine Fornitore</th>
              <Th label="Uscita Materiale" k="dataUscitaMateriale" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Rientro Previsto" k="dataRientroPrevista" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3.5 whitespace-nowrap">Rientro Effettivo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-base" style={{ color: "var(--color-grey-mid)" }}>
                  Nessuna sottoscheda in produzione esterna trovata
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const radice = schedaRadice(s);
                const ritardo = inRitardo(s);
                return (
                  <tr
                    key={s.id}
                    className="border-b last:border-0 transition-all duration-700"
                    style={{ ...(ritardo ? { background: "#FFF8F8" } : {}), opacity: uscenti.has(s.id) ? 0 : 1 }}
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-medium">{s.clienteInfo || "—"}</div>
                      {s.commessaNr && <div className="text-base" style={{ color: "var(--color-grey-mid)" }}>{s.commessaNr}</div>}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-base whitespace-nowrap">
                      {s.tipologia === "Rilavorazione" ? "⚙" : "↳"} {s.odp || "—"}
                      {radice && (
                        <button type="button" onClick={() => setAnteprima(radice)} title="Anteprima della scheda"
                          className="block text-sm font-sans underline decoration-dotted hover:opacity-70"
                          style={{ color: "var(--color-primary)" }}>
                          di {radice.odp || radice.numeroScheda}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-base whitespace-nowrap">
                      {s.numeroScheda ? (
                        <button type="button" onClick={() => setViewing(s)} className="hover:underline font-medium text-left" style={{ color: "var(--color-black)" }}>
                          {s.numeroScheda}
                        </button>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-base max-w-[200px] truncate" title={s.fornitore || ""}>{s.fornitore || "—"}</td>
                    <td className="px-4 py-3.5">{s.statoProdEsterna ? <BadgeStato stato={s.statoProdEsterna} /> : "—"}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col items-start gap-1">
                        {s.pdfOrdineFornitore.map((pdf, i) => (
                          <a
                            key={pdf.id ?? i} href={pdf.url} target="_blank" rel="noopener noreferrer" title={pdf.name}
                            className="inline-flex items-center gap-1 max-w-[220px] px-2 py-0.5 rounded-lg border text-base font-medium hover:opacity-80"
                            style={{ borderColor: "#c7d2fe", color: "#4338ca", background: "#eef2ff" }}
                          >
                            <span>📄</span><span className="truncate">{pdf.name || "Ordine Fornitore"}</span>
                          </a>
                        ))}
                        {s.pdfOrdineFornitore.length === 0 && !canEdit && <span style={{ color: "var(--color-grey-icon)" }}>—</span>}
                        {canEdit && (
                          <button
                            type="button" onClick={() => setOrdineId(s.id)}
                            className="text-base font-semibold px-2 py-0.5 rounded-lg border"
                            style={{ color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.3)", background: "rgba(240,143,37,0.06)" }}
                          >
                            {s.pdfOrdineFornitore.length === 0 ? "+ Carica ordine" : "+ / ✕"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col items-start gap-1">
                        <DataCell date={s.dataUscitaMateriale} inRitardo={false} />
                        {canEdit && s.statoProdEsterna !== "In Lavorazione" && s.statoProdEsterna !== "Rientrato" && (
                          <BottoneMovimento tipo="uscita" label="Segna uscita oggi" onClick={() => segnaMovimento(s, "uscita")} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <DataRientroEditabile date={s.dataRientroPrevista} inRitardo={ritardo} canEdit={canEdit} onSalva={(v) => salvaRientroPrevisto(s, v)} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col items-start gap-1">
                        <DataCell date={s.dataRientroEffettiva} inRitardo={false} />
                        {canEdit && s.statoProdEsterna !== "Rientrato" && (
                          <BottoneMovimento tipo="rientro" label="Segna rientro oggi" onClick={() => segnaMovimento(s, "rientro")} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {schedaOrdine && (
        <ModaleOrdineFornitore
          scheda={schedaOrdine}
          canEdit={canEdit}
          onClose={() => setOrdineId(null)}
          onAggiornata={handleOrdineAggiornato}
        />
      )}

      {viewing && (
        <DettaglioSchedaModal
          key={viewing.id}
          scheda={viewing}
          onClose={() => setViewing(null)}
          userRole={userRole}
          onSchedaAggiornata={handleSchedaAggiornata}
          onViewScheda={setViewing}
          tabIniziale={viewing.produzioneEsterna ? "fornitore" : "info"}
        />
      )}

      {anteprima && (
        <ModaleAnteprimaScheda
          scheda={anteprima}
          onClose={() => setAnteprima(null)}
          onApri={(sc) => { setAnteprima(null); setViewing(sc); }}
        />
      )}
    </div>
  );
}
