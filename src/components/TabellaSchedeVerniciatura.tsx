"use client";

import { useMemo, useState } from "react";
import type { SchedaVerniciatura, StatoSchedaVerniciatura } from "@/lib/types";
import BadgeStato from "./BadgeStato";
import SchedaVerniciaturaModal from "./SchedaVerniciaturaModal";
import { Th } from "./SortableTh";

const inputCls = "border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";
const STATO_LABEL: Record<StatoSchedaVerniciatura, string> = { bozza: "Bozza", in_revisione: "In revisione", approvato: "Approvato", rifiutato: "Rifiutato" };

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

type SortKey = "nome" | "cliente" | "codiceCampioneMaterialista" | "codicePubblico" | "essenza" | "stato" | "versione" | "dataProva" | "createdAt";
type SortDir = "asc" | "desc";

function cmp(a: SchedaVerniciatura, b: SchedaVerniciatura, key: SortKey, dir: SortDir): number {
  let res: number;
  if (key === "versione") res = a.versione - b.versione;
  else if (key === "createdAt" || key === "dataProva") res = (a[key] ?? "").localeCompare(b[key] ?? "");
  else if (key === "nome") res = (a.nome ?? "").localeCompare(b.nome ?? "", "it");
  else if (key === "cliente") res = (a.cliente ?? "").localeCompare(b.cliente ?? "", "it");
  else if (key === "codiceCampioneMaterialista") res = (a.codiceCampioneMaterialista ?? "").localeCompare(b.codiceCampioneMaterialista ?? "", "it");
  else if (key === "codicePubblico") res = (a.codicePubblico ?? "").localeCompare(b.codicePubblico ?? "", "it");
  else if (key === "essenza") res = (a.essenza ?? "").localeCompare(b.essenza ?? "", "it");
  else res = a.stato.localeCompare(b.stato, "it");
  return dir === "asc" ? res : -res;
}

export default function TabellaSchedeVerniciatura({ schede: initial }: { schede: SchedaVerniciatura[] }) {
  const [schede, setSchede] = useState(initial);
  const [search, setSearch] = useState("");
  const [statoFiltro, setStatoFiltro] = useState<StatoSchedaVerniciatura | "">("");
  const [clienteFiltro, setClienteFiltro] = useState("");
  const [modaleAperta, setModaleAperta] = useState(false);
  const [schedaIdAperta, setSchedaIdAperta] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Solo l'ultima versione di ogni scheda va in tabella — le versioni precedenti restano
  // consultabili dentro il contenitore "Versioni precedenti" della scheda più recente (vedi
  // SchedaVerniciaturaModal). Una scheda è "ultima" se nessun'altra la referenzia come padre.
  const schedeUltimaVersione = useMemo(() => {
    const idsConFiglio = new Set(schede.filter((s) => s.schedaPadreId).map((s) => s.schedaPadreId));
    return schede.filter((s) => !idsConFiglio.has(s.id));
  }, [schede]);

  const clienti = useMemo(() => Array.from(new Set(schedeUltimaVersione.map((s) => s.cliente).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b, "it")), [schedeUltimaVersione]);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const filtrate = useMemo(() => {
    const q = search.toLowerCase().trim();
    return schedeUltimaVersione
      .filter((s) => {
        if (statoFiltro && s.stato !== statoFiltro) return false;
        if (clienteFiltro && s.cliente !== clienteFiltro) return false;
        if (q && !`${s.nome ?? ""} ${s.essenza ?? ""} ${s.codicePubblico ?? ""}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => cmp(a, b, sortKey, sortDir));
  }, [schedeUltimaVersione, search, statoFiltro, clienteFiltro, sortKey, sortDir]);

  function apriModifica(id: string) {
    setSchedaIdAperta(id);
    setModaleAperta(true);
  }
  function apriNuova() {
    setSchedaIdAperta(null);
    setModaleAperta(true);
  }
  function handleSaved(s: SchedaVerniciatura) {
    setSchede((prev) => (prev.some((x) => x.id === s.id) ? prev.map((x) => (x.id === s.id ? s : x)) : [s, ...prev]));
    setSchedaIdAperta(s.id);
  }
  function handleDeleted(ids: string[]) {
    setSchede((prev) => prev.filter((x) => !ids.includes(x.id)));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input className={inputCls + " min-w-52"} placeholder="Cerca per nome, essenza, barcode…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={inputCls} value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)}>
          <option value="">Tutti i clienti</option>
          {clienti.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={inputCls} value={statoFiltro} onChange={(e) => setStatoFiltro(e.target.value as StatoSchedaVerniciatura | "")}>
          <option value="">Tutti gli stati</option>
          <option value="bozza">Bozza</option>
          <option value="in_revisione">In revisione</option>
          <option value="approvato">Approvato</option>
          <option value="rifiutato">Rifiutato</option>
        </select>
        <button
          onClick={apriNuova}
          className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #7C3AED, #DB2777)" }}
        >
          + Nuova scheda
        </button>
      </div>

      {modaleAperta && (
        <SchedaVerniciaturaModal schedaId={schedaIdAperta} onClose={() => setModaleAperta(false)} onSaved={handleSaved} onDeleted={handleDeleted} />
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-base">
          <thead>
            <tr className="border-b text-left text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <Th label="Nome scheda" sortKey="nome" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Cliente" sortKey="cliente" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Cod. Material List" sortKey="codiceCampioneMaterialista" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Barcode" sortKey="codicePubblico" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Essenza" sortKey="essenza" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Stato" sortKey="stato" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Versione" sortKey="versione" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Data prova" sortKey="dataProva" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3">Foto</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtrate.length === 0 ? (
              <tr><td colSpan={10} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessuna scheda trovata</td></tr>
            ) : (
              filtrate.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-orange-50/30 cursor-pointer" onClick={() => apriModifica(s.id)}>
                  <td className="px-4 py-3 font-medium">
                    {s.nome || "— senza nome —"}
                    {s.ignifuga === true && <span className="ml-2 text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "#FEE2E2", color: "#991B1B" }}>Ignifuga</span>}
                  </td>
                  <td className="px-4 py-3">{s.cliente || "—"}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: "var(--color-grey-mid)" }}>{s.codiceCampioneMaterialista || "—"}</td>
                  <td className="px-4 py-3 font-mono text-sm">{s.codicePubblico || "—"}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: "var(--color-grey-mid)" }}>{s.essenza || "—"}</td>
                  <td className="px-4 py-3"><BadgeStato stato={STATO_LABEL[s.stato]} /></td>
                  <td className="px-4 py-3">v{s.versione}</td>
                  <td className="px-4 py-3 text-sm">{fmtData(s.dataProva)}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: "var(--color-grey-mid)" }}>{s.foto?.length ?? 0}</td>
                  <td className="px-4 py-3 text-sm underline" style={{ color: "var(--color-primary)" }}>Apri</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
