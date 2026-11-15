"use client";

import { useMemo, useState } from "react";
import type { ArticoloElettrico } from "@/lib/types";
import { Th } from "./SortableTh";
import ArticoloElettricoFormModal from "./ArticoloElettricoFormModal";
import ArticoloElettricoCaricoScaricoModal from "./ArticoloElettricoCaricoScaricoModal";

type SortKey =
  | "tipoArticolo" | "marca" | "caratteristiche" | "fornitore" | "unitaMisura"
  | "descrizione" | "clienteRiferimento" | "segnalataUsoIl" | "giacenzaAttuale";
type SortDir = "asc" | "desc";

function valoreOrdinamento(p: ArticoloElettrico, key: SortKey): string | number {
  if (key === "giacenzaAttuale") return p.giacenzaAttuale;
  return (p[key] as string) ?? "";
}

function cmp(a: ArticoloElettrico, b: ArticoloElettrico, key: SortKey, dir: SortDir): number {
  const va = valoreOrdinamento(a, key);
  const vb = valoreOrdinamento(b, key);
  const res = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "it");
  return dir === "asc" ? res : -res;
}

export default function MagazzinoMaterialeElettricoHome({ articoli: initial }: { articoli: ArticoloElettrico[] }) {
  const [articoli, setArticoli] = useState(initial);
  const [search, setSearch] = useState("");
  const [soloMovimentati, setSoloMovimentati] = useState(false);
  const [soloAttivi, setSoloAttivi] = useState(true);
  const [formModale, setFormModale] = useState<{ articolo: ArticoloElettrico | null } | null>(null);
  const [movimentoModale, setMovimentoModale] = useState<{ articolo: ArticoloElettrico; tipo: "carico" | "scarico" } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("tipoArticolo");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function handleUpsert(p: ArticoloElettrico) {
    setArticoli(prev => {
      const esiste = prev.some(x => x.id === p.id);
      return esiste ? prev.map(x => (x.id === p.id ? p : x)) : [p, ...prev];
    });
    setFormModale(null);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = articoli
      .filter(p => !soloAttivi || p.attivo)
      .filter(p => !soloMovimentati || p.segnalataUsoIl != null)
      .filter(p => !q || `${p.tipoArticolo ?? ""} ${p.descrizione ?? ""} ${p.marca ?? ""} ${p.caratteristiche ?? ""} ${p.fornitore ?? ""} ${p.codice ?? ""} ${p.codiceInventario ?? ""} ${p.clienteRiferimento ?? ""}`
        .toLowerCase().includes(q));
    return [...base].sort((a, b) => cmp(a, b, sortKey, sortDir));
  }, [articoli, search, soloAttivi, soloMovimentati, sortKey, sortDir]);

  const numMovimentati = useMemo(
    () => articoli.filter(p => (!soloAttivi || p.attivo) && p.segnalataUsoIl != null).length,
    [articoli, soloAttivi]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          className="border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 min-w-52"
          placeholder="Cerca tipo, descrizione, marca, caratteristiche, fornitore, codici…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          onClick={() => setSoloAttivi(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded border text-sm font-medium transition-colors"
          style={soloAttivi
            ? { background: "#DCFCE7", color: "#166534", borderColor: "#86EFAC" }
            : { background: "white", color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}
        >
          Solo Attivi (nascondi obsoleti)
        </button>
        <button
          onClick={() => setSoloMovimentati(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded border text-sm font-medium transition-colors"
          style={soloMovimentati
            ? { background: "#FEF3C7", color: "#92400E", borderColor: "#FCD34D" }
            : { background: "white", color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}
        >
          Movimentati / Da Inventariare
          {numMovimentati > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full text-xs font-bold w-5 h-5"
              style={soloMovimentati ? { background: "#92400E", color: "white" } : { background: "#FEF3C7", color: "#92400E" }}
            >
              {numMovimentati}
            </span>
          )}
        </button>
        <button
          onClick={() => setFormModale({ articolo: null })}
          className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #7C3AED, #DB2777)" }}
        >
          + Nuovo articolo
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <Th label="Tipo" sortKey="tipoArticolo" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Descrizione" sortKey="descrizione" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Marca" sortKey="marca" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Caratteristiche" sortKey="caratteristiche" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Fornitore" sortKey="fornitore" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="U.M." sortKey="unitaMisura" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Movimentato" sortKey="segnalataUsoIl" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Giacenza" sortKey="giacenzaAttuale" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessun articolo trovato
                </td>
              </tr>
            ) : (
              filtered.map(p => (
                <tr key={p.id} className="border-b last:border-0" style={p.attivo ? undefined : { opacity: 0.55 }}>
                  <td className="px-4 py-3 font-medium">
                    {p.tipoArticolo || "—"}
                    {!p.attivo && <span className="ml-1.5 text-xs font-normal" style={{ color: "#991B1B" }}>(Obsoleto)</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">{p.descrizione || "—"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{p.marca || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{p.caratteristiche || "—"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{p.fornitore || "—"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{p.unitaMisura || "—"}</td>
                  <td className="px-4 py-3">
                    {p.segnalataUsoIl ? (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                        style={{ background: "#FEF3C7", color: "#92400E" }}
                        title={new Date(p.segnalataUsoIl).toLocaleString("it-IT")}
                      >
                        Da inventariare
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{p.giacenzaAttuale}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end items-center">
                      <button
                        onClick={() => setFormModale({ articolo: p })}
                        className="text-xs underline whitespace-nowrap"
                        style={{ color: "var(--color-primary)" }}
                      >
                        Modifica
                      </button>
                      <button
                        onClick={() => setMovimentoModale({ articolo: p, tipo: "carico" })}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap border"
                        style={{ color: "#166534", background: "rgba(22,101,52,0.08)", borderColor: "rgba(22,101,52,0.3)" }}
                      >
                        Carico
                      </button>
                      <button
                        onClick={() => setMovimentoModale({ articolo: p, tipo: "scarico" })}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap border"
                        style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}
                      >
                        Scarico
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formModale && (
        <ArticoloElettricoFormModal
          articolo={formModale.articolo}
          onClose={() => setFormModale(null)}
          onSalvato={handleUpsert}
        />
      )}

      {movimentoModale && (
        <ArticoloElettricoCaricoScaricoModal
          articolo={movimentoModale.articolo}
          tipo={movimentoModale.tipo}
          onClose={() => setMovimentoModale(null)}
          onSalvato={(giacenzaRisultante) => {
            const id = movimentoModale.articolo.id;
            setArticoli(prev => prev.map(x => (x.id === id ? { ...x, giacenzaAttuale: giacenzaRisultante, segnalataUsoIl: new Date().toISOString() } : x)));
          }}
        />
      )}
    </div>
  );
}
