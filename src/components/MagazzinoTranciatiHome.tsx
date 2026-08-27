"use client";

import { useMemo, useState } from "react";
import type { Tranciato } from "@/lib/types";
import { Th } from "./SortableTh";
import TranciatoFormModal from "./TranciatoFormModal";
import TranciatoCaricoScaricoModal from "./TranciatoCaricoScaricoModal";

type SortKey =
  | "essenza" | "qualita" | "fornitore" | "unitaMisura"
  | "spessoreMm" | "larghezzaMm" | "lunghezzaMm" | "clienteRiferimento" | "segnalataUsoIl" | "giacenzaAttuale";
type SortDir = "asc" | "desc";

function valoreOrdinamento(t: Tranciato, key: SortKey): string | number {
  if (key === "giacenzaAttuale") return t.giacenzaAttuale;
  if (key === "spessoreMm") return t.spessoreMm ?? -1;
  if (key === "larghezzaMm") return t.larghezzaMm ?? -1;
  if (key === "lunghezzaMm") return t.lunghezzaMm ?? -1;
  return (t[key] as string) ?? "";
}

function cmp(a: Tranciato, b: Tranciato, key: SortKey, dir: SortDir): number {
  const va = valoreOrdinamento(a, key);
  const vb = valoreOrdinamento(b, key);
  const res = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "it");
  return dir === "asc" ? res : -res;
}

export default function MagazzinoTranciatiHome({ tranciati: initial }: { tranciati: Tranciato[] }) {
  const [tranciati, setTranciati] = useState(initial);
  const [search, setSearch] = useState("");
  const [soloMovimentati, setSoloMovimentati] = useState(false);
  const [soloAttivi, setSoloAttivi] = useState(true);
  const [formModale, setFormModale] = useState<{ tranciato: Tranciato | null } | null>(null);
  const [movimentoModale, setMovimentoModale] = useState<{ tranciato: Tranciato; tipo: "carico" | "scarico" } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("essenza");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function handleUpsert(t: Tranciato) {
    setTranciati(prev => {
      const esiste = prev.some(x => x.id === t.id);
      return esiste ? prev.map(x => (x.id === t.id ? t : x)) : [t, ...prev];
    });
    setFormModale(null);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = tranciati
      .filter(t => !soloAttivi || t.attivo)
      .filter(t => !soloMovimentati || t.segnalataUsoIl != null)
      .filter(t => !q || `${t.essenza ?? ""} ${t.qualita ?? ""} ${t.fornitore ?? ""} ${t.codice ?? ""} ${t.codiceInventario ?? ""} ${t.clienteRiferimento ?? ""}`
        .toLowerCase().includes(q));
    return [...base].sort((a, b) => cmp(a, b, sortKey, sortDir));
  }, [tranciati, search, soloAttivi, soloMovimentati, sortKey, sortDir]);

  const numMovimentati = useMemo(
    () => tranciati.filter(t => (!soloAttivi || t.attivo) && t.segnalataUsoIl != null).length,
    [tranciati, soloAttivi]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          className="border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 min-w-52"
          placeholder="Cerca essenza, qualità, fornitore, codici…"
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
          onClick={() => setFormModale({ tranciato: null })}
          className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #7C3AED, #DB2777)" }}
        >
          + Nuovo tranciato
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <Th label="Essenza" sortKey="essenza" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Qualità" sortKey="qualita" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="min-w-[120px]" />
              <Th label="Spess. (mm)" sortKey="spessoreMm" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Largh. (mm)" sortKey="larghezzaMm" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Lungh. (mm)" sortKey="lunghezzaMm" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Fornitore" sortKey="fornitore" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="U.M." sortKey="unitaMisura" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Cliente" sortKey="clienteRiferimento" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Movimentato" sortKey="segnalataUsoIl" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Giacenza" sortKey="giacenzaAttuale" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessun tranciato trovato
                </td>
              </tr>
            ) : (
              filtered.map(t => (
                <tr key={t.id} className="border-b last:border-0" style={t.attivo ? undefined : { opacity: 0.55 }}>
                  <td className="px-4 py-3 font-medium">
                    {t.essenza || "—"}
                    {!t.attivo && <span className="ml-1.5 text-xs font-normal" style={{ color: "#991B1B" }}>(Obsoleto)</span>}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{t.qualita || "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-xs">{t.spessoreMm ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-xs">{t.larghezzaMm ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-xs">{t.lunghezzaMm ?? "—"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{t.fornitore || "—"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{t.unitaMisura || "—"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{t.clienteRiferimento || "—"}</td>
                  <td className="px-4 py-3">
                    {t.segnalataUsoIl ? (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                        style={{ background: "#FEF3C7", color: "#92400E" }}
                        title={new Date(t.segnalataUsoIl).toLocaleString("it-IT")}
                      >
                        Da inventariare
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{t.giacenzaAttuale}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end items-center">
                      <button
                        onClick={() => setFormModale({ tranciato: t })}
                        className="text-xs underline whitespace-nowrap"
                        style={{ color: "var(--color-primary)" }}
                      >
                        Modifica
                      </button>
                      <button
                        onClick={() => setMovimentoModale({ tranciato: t, tipo: "carico" })}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap border"
                        style={{ color: "#166534", background: "rgba(22,101,52,0.08)", borderColor: "rgba(22,101,52,0.3)" }}
                      >
                        Carico
                      </button>
                      <button
                        onClick={() => setMovimentoModale({ tranciato: t, tipo: "scarico" })}
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
        <TranciatoFormModal
          tranciato={formModale.tranciato}
          onClose={() => setFormModale(null)}
          onSalvato={handleUpsert}
        />
      )}

      {movimentoModale && (
        <TranciatoCaricoScaricoModal
          tranciato={movimentoModale.tranciato}
          tipo={movimentoModale.tipo}
          onClose={() => setMovimentoModale(null)}
          onSalvato={(giacenzaRisultante) => {
            const id = movimentoModale.tranciato.id;
            setTranciati(prev => prev.map(x => (x.id === id ? { ...x, giacenzaAttuale: giacenzaRisultante, segnalataUsoIl: new Date().toISOString() } : x)));
          }}
        />
      )}
    </div>
  );
}
