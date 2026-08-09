"use client";

import { useMemo, useState } from "react";
import type { Campionatura, EsitoCampionatura } from "@/lib/types";
import { CLIENTI_VERNICIATURA } from "@/lib/types";
import BadgeStato from "./BadgeStato";
import CampionaturaFormModal from "./CampionaturaFormModal";
import CampionaturaDetailModal from "./CampionaturaDetailModal";
import { Th } from "./SortableTh";

const inputCls = "border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";
const ESITO_LABEL: Record<EsitoCampionatura, string> = { approvato: "Approvato", rifiutato: "Rifiutato", in_revisione: "In revisione" };

type SortKey = "codicePubblico" | "cliente" | "dataCampionatura" | "esito" | "foto" | "codiceCampioneMaterialista";
type SortDir = "asc" | "desc";

function cmp(a: Campionatura, b: Campionatura, key: SortKey, dir: SortDir): number {
  let res: number;
  if (key === "foto") res = (a.foto?.length ?? 0) - (b.foto?.length ?? 0);
  else if (key === "codiceCampioneMaterialista") res = (a.codiceCampioneMaterialista ?? "").localeCompare(b.codiceCampioneMaterialista ?? "", "it");
  else res = String(a[key]).localeCompare(String(b[key]), "it");
  return dir === "asc" ? res : -res;
}

export default function TabellaCampionature({ campionature: initial }: { campionature: Campionatura[] }) {
  const [campionature, setCampionature] = useState(initial);
  const [search, setSearch] = useState("");
  const [clienteFiltro, setClienteFiltro] = useState("");
  const [esitoFiltro, setEsitoFiltro] = useState<EsitoCampionatura | "">("");
  const [modaleNuovaAperta, setModaleNuovaAperta] = useState(false);
  const [dettaglioAperto, setDettaglioAperto] = useState<Campionatura | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("dataCampionatura");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const filtrate = useMemo(() => {
    const q = search.toLowerCase().trim();
    return campionature
      .filter((c) => {
        if (clienteFiltro && c.cliente !== clienteFiltro) return false;
        if (esitoFiltro && c.esito !== esitoFiltro) return false;
        if (q && !c.codicePubblico.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => cmp(a, b, sortKey, sortDir));
  }, [campionature, search, clienteFiltro, esitoFiltro, sortKey, sortDir]);

  function handleUpsert(c: Campionatura) {
    setCampionature((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [c, ...prev]));
    setDettaglioAperto((prev) => (prev?.id === c.id ? c : prev));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input className={inputCls + " min-w-52"} placeholder="Cerca barcode…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={inputCls} value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)}>
          <option value="">Tutti i clienti</option>
          {CLIENTI_VERNICIATURA.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={inputCls} value={esitoFiltro} onChange={(e) => setEsitoFiltro(e.target.value as EsitoCampionatura | "")}>
          <option value="">Tutti gli esiti</option>
          <option value="approvato">Approvato</option>
          <option value="rifiutato">Rifiutato</option>
          <option value="in_revisione">In revisione</option>
        </select>
        <button
          onClick={() => setModaleNuovaAperta(true)}
          className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #7C3AED, #DB2777)" }}
        >
          + Nuova campionatura
        </button>
      </div>

      {modaleNuovaAperta && (
        <CampionaturaFormModal
          onClose={() => setModaleNuovaAperta(false)}
          onCreata={(c) => { setCampionature((prev) => [c, ...prev]); setModaleNuovaAperta(false); }}
        />
      )}
      {dettaglioAperto && (
        <CampionaturaDetailModal campionatura={dettaglioAperto} onClose={() => setDettaglioAperto(null)} onAggiornata={handleUpsert} />
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <Th label="Barcode" sortKey="codicePubblico" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Cliente" sortKey="cliente" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Data" sortKey="dataCampionatura" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Esito" sortKey="esito" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Foto" sortKey="foto" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Cod. campione materialista" sortKey="codiceCampioneMaterialista" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtrate.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessuna campionatura trovata</td></tr>
            ) : (
              filtrate.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-orange-50/30 cursor-pointer" onClick={() => setDettaglioAperto(c)}>
                  <td className="px-4 py-3 font-mono text-xs font-medium">{c.codicePubblico}</td>
                  <td className="px-4 py-3">{c.cliente}</td>
                  <td className="px-4 py-3 text-xs">{new Date(c.dataCampionatura).toLocaleDateString("it-IT")}</td>
                  <td className="px-4 py-3"><BadgeStato stato={ESITO_LABEL[c.esito]} /></td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{c.foto?.length ?? 0}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{c.codiceCampioneMaterialista || "—"}</td>
                  <td className="px-4 py-3 text-xs underline" style={{ color: "var(--color-primary)" }}>Apri</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
