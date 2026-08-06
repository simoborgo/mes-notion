"use client";

import { memo, useMemo, useState } from "react";
import Link from "next/link";
import type { ArticoloFerramenta } from "@/lib/types";
import { normalizzaCodiceFornitore, nomeFornitore } from "@/lib/ferramentaCodici";

function isSottoSoglia(a: ArticoloFerramenta): boolean {
  return a.sogliaMinima != null && a.giacenzaAttuale < a.sogliaMinima;
}

export default function FerramentaHome({ articoli }: { articoli: ArticoloFerramenta[] }) {
  // Bozza (controlla gli input) vs applicato (guida il filtro/render della tabella) — con
  // 8358 articoli filtrare/ri-renderizzare ad ogni tasto digitato appesantiva la ricerca.
  // Si applica solo con il pulsante "Cerca" o Invio nella casella di testo.
  const [searchInput, setSearchInput] = useState("");
  const [fornitoreInput, setFornitoreInput] = useState("");
  const [soloDaRiordinareInput, setSoloDaRiordinareInput] = useState(false);
  const [soloInventariatiInput, setSoloInventariatiInput] = useState(false);

  const [search, setSearch] = useState("");
  const [soloDaRiordinare, setSoloDaRiordinare] = useState(false);
  const [fornitoreFiltro, setFornitoreFiltro] = useState("");
  const [soloInventariati, setSoloInventariati] = useState(false);

  function applicaFiltri() {
    setSearch(searchInput);
    setFornitoreFiltro(fornitoreInput);
    setSoloDaRiordinare(soloDaRiordinareInput);
    setSoloInventariati(soloInventariatiInput);
  }

  const attivi = useMemo(() => articoli.filter(a => a.attivo), [articoli]);

  const fornitoriOptions = useMemo(
    () => Array.from(new Set(attivi.map(nomeFornitore).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [attivi]
  );

  const daRiordinareCount = useMemo(
    () => attivi.filter(isSottoSoglia).length,
    [attivi]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const qNormalizzata = normalizzaCodiceFornitore(search);
    return attivi
      .filter(a => {
        if (soloDaRiordinare && !isSottoSoglia(a)) return false;
        if (soloInventariati && !a.inventariato) return false;
        if (fornitoreFiltro && nomeFornitore(a) !== fornitoreFiltro) return false;
        if (q) {
          const matchTesto = `${a.descrizione} ${a.codiceOs1} ${nomeFornitore(a)} ${a.codiceFornitore}`.toLowerCase().includes(q);
          // Cerca anche per codice fornitore normalizzato (zeri iniziali/spazi ignorati) —
          // stessa logica di confronto già usata in Anagrafica e nel matching Ordini Wurth.
          const matchCodiceFornitore = qNormalizzata && a.codiceFornitore && normalizzaCodiceFornitore(a.codiceFornitore).includes(qNormalizzata);
          if (!matchTesto && !matchCodiceFornitore) return false;
        }
        return true;
      })
      .sort((a, b) => a.descrizione.localeCompare(b.descrizione));
  }, [attivi, search, soloDaRiordinare, fornitoreFiltro, soloInventariati]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <input
          className="border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 min-w-52"
          placeholder="Cerca descrizione, codice, cod. fornitore…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") applicaFiltri(); }}
        />
        <select
          className="border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
          value={fornitoreInput}
          onChange={(e) => setFornitoreInput(e.target.value)}
        >
          <option value="">Tutti i fornitori</option>
          {fornitoriOptions.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <button
          onClick={() => setSoloDaRiordinareInput(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded border text-sm font-medium transition-colors"
          style={soloDaRiordinareInput
            ? { background: "#FEE2E2", color: "#991B1B", borderColor: "#FCA5A5" }
            : { background: "white", color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}
        >
          ⚠ Da riordinare
          {daRiordinareCount > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full text-xs font-bold w-5 h-5"
              style={soloDaRiordinareInput ? { background: "#991B1B", color: "white" } : { background: "#FEE2E2", color: "#991B1B" }}
            >
              {daRiordinareCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setSoloInventariatiInput(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded border text-sm font-medium transition-colors"
          style={soloInventariatiInput
            ? { background: "#DCFCE7", color: "#166534", borderColor: "#86EFAC" }
            : { background: "white", color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}
        >
          Inventariati
        </button>
        <button
          onClick={applicaFiltri}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: "var(--color-primary)" }}
        >
          Cerca
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <th className="px-4 py-3">Codice OS1</th>
              <th className="px-4 py-3 min-w-[200px]">Descrizione</th>
              <th className="px-4 py-3">Fornitore</th>
              <th className="px-4 py-3">Cod. Fornitore</th>
              <th className="px-4 py-3">Metodo</th>
              <th className="px-4 py-3">Giacenza</th>
              <th className="px-4 py-3">Soglia Minima</th>
              <th className="px-4 py-3">Inventariati</th>
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
              filtered.map(a => <RigaGiacenza key={a.id} articolo={a} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const RigaGiacenza = memo(function RigaGiacenza({ articolo: a }: { articolo: ArticoloFerramenta }) {
  const sotto = isSottoSoglia(a);
  return (
    <tr className="border-b last:border-0" style={sotto ? { background: "#FFF8F8" } : undefined}>
      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{a.codiceOs1 || "—"}</td>
      <td className="px-4 py-3 font-medium">{a.descrizione}</td>
      <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{nomeFornitore(a) || "—"}</td>
      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{a.codiceFornitore || "—"}</td>
      <td className="px-4 py-3">
        {a.metodoGestione ? (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#F3F4F6", color: "#374151" }}>
            {a.metodoGestione}
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#FEF9C3", color: "#92400E" }}>
            Non classificato
          </span>
        )}
      </td>
      <td className="px-4 py-3 tabular-nums">
        {sotto ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: "#FEE2E2", color: "#991B1B" }}>
            ⚠ {a.giacenzaAttuale} {a.unitaMisura}
          </span>
        ) : (
          <span>{a.giacenzaAttuale} {a.unitaMisura}</span>
        )}
      </td>
      <td className="px-4 py-3 tabular-nums">{a.sogliaMinima ?? "—"}</td>
      <td className="px-4 py-3">
        {a.inventariato ? (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#DCFCE7", color: "#166534" }}>Sì</span>
        ) : (
          <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {a.metodoGestione && (
          <Link
            href={`/ferramenta/scarico/${a.id}`}
            className="text-sm px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap border"
            style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}
          >
            Scarica
          </Link>
        )}
      </td>
    </tr>
  );
});
