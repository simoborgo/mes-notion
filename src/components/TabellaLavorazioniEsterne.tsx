"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Scheda } from "@/lib/types";
import type { Role } from "@/lib/roles";
import BadgeStato from "./BadgeStato";
import DettaglioSchedaModal from "./DettaglioSchedaModal";

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
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums"
        style={{ background: "#FEE2E2", color: "#991B1B" }}
      >
        ⚠ {fmt(date)}
      </span>
    );
  }
  return <span className="tabular-nums whitespace-nowrap">{fmt(date)}</span>;
}

function Th({ label, k, sortKey, sortDir, onSort }: { label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void }) {
  const active = sortKey === k;
  return (
    <th className="px-4 py-3 whitespace-nowrap cursor-pointer select-none" onClick={() => onSort(k)}>
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

  const esterne = useMemo(() => sottoschede.filter((s) => s.produzioneEsterna), [sottoschede]);

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

  function inRitardo(s: Scheda): boolean {
    return (
      s.statoProdEsterna !== "Rientrato" &&
      !s.dataRientroEffettiva &&
      !!s.dataRientroPrevista &&
      s.dataRientroPrevista < today
    );
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return esterne
      .filter((s) => {
        if (nascondiRientrate && s.statoProdEsterna === "Rientrato") return false;
        if (soloRitardo && !inRitardo(s)) return false;
        if (filtroFornitore && s.fornitore !== filtroFornitore) return false;
        if (filtroStato && s.statoProdEsterna !== filtroStato) return false;
        if (q && !`${s.odp} ${s.clienteInfo} ${s.numeroScheda} ${s.commessaNr} ${s.fornitore}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const va = (a[sortKey] as string) ?? "";
        const vb = (b[sortKey] as string) ?? "";
        const res = va < vb ? -1 : va > vb ? 1 : 0;
        return sortDir === "asc" ? res : -res;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esterne, search, filtroFornitore, filtroStato, nascondiRientrate, soloRitardo, sortKey, sortDir, today]);

  const conteggioRitardo = useMemo(() => esterne.filter((s) => inRitardo(s)).length, [esterne, today]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleReload() {
    if (!revalidate) return;
    startTransition(async () => { await revalidate(); router.refresh(); });
  }

  function handleSchedaAggiornata(updated: Scheda) {
    setViewing(updated);
    handleReload();
  }

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
          className="px-3 py-2 rounded-lg text-sm border"
          style={{ borderColor: "#E4E0DA", minWidth: 220 }}
        />
        <select
          value={filtroFornitore}
          onChange={(e) => setFiltroFornitore(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm border"
          style={{ borderColor: "#E4E0DA" }}
        >
          <option value="">Tutti i fornitori</option>
          {fornitoriUniq.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select
          value={filtroStato}
          onChange={(e) => setFiltroStato(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm border"
          style={{ borderColor: "#E4E0DA" }}
        >
          <option value="">Tutti gli stati</option>
          {statiUniq.map((st) => <option key={st} value={st}>{st}</option>)}
        </select>
        <button
          onClick={() => setNascondiRientrate((v) => !v)}
          className="px-3 py-2 rounded-lg text-sm font-semibold border transition-colors"
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
          className="px-3 py-2 rounded-lg text-sm font-semibold border transition-colors"
          style={
            soloRitardo
              ? { background: "#DC2626", color: "white", borderColor: "#DC2626" }
              : { background: "white", color: "var(--color-grey-mid)", borderColor: "#E4E0DA" }
          }
        >
          ⚠ Rientro in ritardo ({conteggioRitardo})
        </button>
        <span className="text-xs ml-auto" style={{ color: "var(--color-grey-mid)" }}>
          {filtered.length} su {esterne.length} sottoschede in produzione esterna
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "#E4E0DA" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ background: "#FAFAF9", borderColor: "#E4E0DA", color: "var(--color-grey-mid)" }}>
              <th className="px-4 py-3 whitespace-nowrap">Cliente / Commessa</th>
              <Th label="ODP" k="odp" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 whitespace-nowrap">Numero Scheda</th>
              <Th label="Fornitore" k="fornitore" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 whitespace-nowrap">Stato</th>
              <Th label="Uscita Materiale" k="dataUscitaMateriale" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Rientro Previsto" k="dataRientroPrevista" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 whitespace-nowrap">Rientro Effettivo</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
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
                    className="border-b last:border-0 transition-colors"
                    style={ritardo ? { background: "#FFF8F8" } : undefined}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.clienteInfo || "—"}</div>
                      {s.commessaNr && <div className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{s.commessaNr}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                      {s.tipologia === "Rilavorazione" ? "⚙" : "↳"} {s.odp || "—"}
                      {radice && radice.odp !== s.odp && (
                        <div className="text-[11px] font-sans" style={{ color: "var(--color-grey-mid)" }}>di {radice.odp}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{s.numeroScheda || "—"}</td>
                    <td className="px-4 py-3 text-xs max-w-[160px] truncate" title={s.fornitore || ""}>{s.fornitore || "—"}</td>
                    <td className="px-4 py-3">{s.statoProdEsterna ? <BadgeStato stato={s.statoProdEsterna} /> : "—"}</td>
                    <td className="px-4 py-3"><DataCell date={s.dataUscitaMateriale} inRitardo={false} /></td>
                    <td className="px-4 py-3"><DataCell date={s.dataRientroPrevista} inRitardo={ritardo} /></td>
                    <td className="px-4 py-3"><DataCell date={s.dataRientroEffettiva} inRitardo={false} /></td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setViewing(s)}
                        className="text-sm px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap border"
                        style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}
                      >
                        Vedi scheda
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {viewing && (
        <DettaglioSchedaModal
          scheda={viewing}
          onClose={() => setViewing(null)}
          userRole={userRole}
          onSchedaAggiornata={handleSchedaAggiornata}
          tabIniziale="fornitore"
        />
      )}
    </div>
  );
}
