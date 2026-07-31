"use client";

import { useMemo, useState } from "react";
import type { ArticoloFerramenta, MetodoGestioneFerramenta } from "@/lib/types";
import { UBICAZIONI_FERRAMENTA } from "@/lib/types";
import { normalizzaCodiceFornitore } from "@/lib/ferramentaCodici";

interface RowState {
  metodoGestione: MetodoGestioneFerramenta | "";
  quantitaStandardVaschetta: string;
  sogliaMinima: string;
  attivo: boolean;
  ubicazione: string;
  codiceFornitore: string;
  saving: boolean;
  error: string | null;
  savedAt: number | null;
}

function initRow(a: ArticoloFerramenta): RowState {
  return {
    metodoGestione: a.metodoGestione ?? "",
    quantitaStandardVaschetta: a.quantitaStandardVaschetta != null ? String(a.quantitaStandardVaschetta) : "",
    sogliaMinima: a.sogliaMinima != null ? String(a.sogliaMinima) : "",
    attivo: a.attivo,
    ubicazione: a.ubicazione ?? "",
    codiceFornitore: a.codiceFornitore ?? "",
    saving: false,
    error: null,
    savedAt: null,
  };
}

export default function TabellaArticoliFerramenta({ articoli: initial }: { articoli: ArticoloFerramenta[] }) {
  const [articoli, setArticoli] = useState(initial);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const map: Record<string, RowState> = {};
    initial.forEach(a => { map[a.id] = initRow(a); });
    return map;
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return articoli;
    const qNormalizzata = normalizzaCodiceFornitore(search);
    return articoli.filter(a => {
      if (`${a.descrizione} ${a.codiceOs1} ${a.fornitoreNome} ${a.codiceFornitore} ${a.descrizioneFornitore}`.toLowerCase().includes(q)) return true;
      // Cerca anche per codice fornitore normalizzato: incolla il codice così com'è nel
      // tracciato fornitore (con zeri iniziali/spazi) e lo trova comunque — stessa logica
      // di confronto usata dal matching della Gestione Ordini Wurth.
      if (qNormalizzata && a.codiceFornitore && normalizzaCodiceFornitore(a.codiceFornitore).includes(qNormalizzata)) return true;
      return false;
    });
  }, [articoli, search]);

  function setRow(id: string, patch: Partial<RowState>) {
    setRows(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function salva(a: ArticoloFerramenta) {
    const row = rows[a.id];
    if (!row) return;
    if (row.metodoGestione === "Kanban" && !(Number(row.quantitaStandardVaschetta) > 0)) {
      setRow(a.id, { error: "Quantità Standard Vaschetta obbligatoria (> 0) per Kanban" });
      return;
    }
    setRow(a.id, { saving: true, error: null, savedAt: null });
    try {
      const res = await fetch(`/api/ferramenta/articoli/${a.id}/classificazione`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodoGestione: row.metodoGestione || null,
          quantitaStandardVaschetta: row.metodoGestione === "Kanban" && row.quantitaStandardVaschetta ? Number(row.quantitaStandardVaschetta) : null,
          sogliaMinima: row.sogliaMinima ? Number(row.sogliaMinima) : null,
          attivo: row.attivo,
          ubicazione: row.ubicazione || null,
          codiceFornitore: row.codiceFornitore || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setArticoli(prev => prev.map(x => x.id === a.id ? {
        ...x,
        metodoGestione: row.metodoGestione || null,
        quantitaStandardVaschetta: row.metodoGestione === "Kanban" && row.quantitaStandardVaschetta ? Number(row.quantitaStandardVaschetta) : null,
        sogliaMinima: row.sogliaMinima ? Number(row.sogliaMinima) : null,
        attivo: row.attivo,
        ubicazione: row.ubicazione,
        codiceFornitore: row.codiceFornitore,
      } : x));
      setRow(a.id, { saving: false, savedAt: Date.now() });
      setTimeout(() => setRow(a.id, { savedAt: null }), 3000);
    } catch (e) {
      setRow(a.id, { saving: false, error: e instanceof Error ? e.message : "Errore salvataggio" });
    }
  }

  const inputCls = "border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

  return (
    <div className="space-y-3">
      <input
        className={inputCls + " min-w-52"}
        placeholder="Cerca descrizione, codice OS1, cod. fornitore, fornitore…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <th className="px-4 py-3">Codice OS1</th>
              <th className="px-4 py-3 min-w-[180px]">Descrizione</th>
              <th className="px-4 py-3">Fornitore</th>
              <th className="px-4 py-3">Cod. Fornitore</th>
              <th className="px-4 py-3">Metodo Gestione</th>
              <th className="px-4 py-3">Qtà Vaschetta</th>
              <th className="px-4 py-3">Soglia Minima</th>
              <th className="px-4 py-3">Giacenza</th>
              <th className="px-4 py-3">Ubicazione</th>
              <th className="px-4 py-3">Attivo</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessun articolo trovato
                </td>
              </tr>
            ) : (
              filtered.map(a => {
                const row = rows[a.id];
                if (!row) return null;
                return (
                  <tr key={a.id} className="border-b last:border-0 align-top">
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{a.codiceOs1 || "—"}</td>
                    <td className="px-4 py-3 font-medium">
                      {a.descrizione}
                      {a.descrizioneFornitore && a.descrizioneFornitore !== a.descrizione && (
                        <div className="text-xs font-normal mt-0.5" style={{ color: "var(--color-grey-mid)" }} title="Descrizione così come la scrive il fornitore nei tracciati">
                          Fornitore: {a.descrizioneFornitore}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        <a href={`/api/ferramenta/articoli/${a.id}/etichetta`} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: "var(--color-primary)" }}>
                          Stampa etichetta
                        </a>
                        {a.metodoGestione === "Kanban" && (
                          <a href={`/api/ferramenta/articoli/${a.id}/etichetta-riordino`} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: "var(--color-primary)" }}>
                            Etichetta riordino (PDF)
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{a.fornitoreNome || "—"}</td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        className={inputCls + " w-28"}
                        placeholder="—"
                        value={row.codiceFornitore}
                        onChange={(e) => setRow(a.id, { codiceFornitore: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className={inputCls}
                        value={row.metodoGestione}
                        onChange={(e) => setRow(a.id, { metodoGestione: e.target.value as MetodoGestioneFerramenta | "" })}
                      >
                        <option value="">— Non classificato —</option>
                        <option value="Kanban">Kanban</option>
                        <option value="A Pezzo">A Pezzo</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number" min="0" step="any"
                        className={inputCls + " w-24"}
                        disabled={row.metodoGestione !== "Kanban"}
                        value={row.quantitaStandardVaschetta}
                        onChange={(e) => setRow(a.id, { quantitaStandardVaschetta: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number" min="0" step="any"
                        className={inputCls + " w-24"}
                        value={row.sogliaMinima}
                        onChange={(e) => setRow(a.id, { sogliaMinima: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-3 tabular-nums">{a.giacenzaAttuale} {a.unitaMisura}</td>
                    <td className="px-4 py-3">
                      <select
                        className={inputCls}
                        value={row.ubicazione}
                        onChange={(e) => setRow(a.id, { ubicazione: e.target.value })}
                      >
                        <option value="">—</option>
                        {UBICAZIONI_FERRAMENTA.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={row.attivo}
                        onChange={(e) => setRow(a.id, { attivo: e.target.checked })}
                        className="w-4 h-4 cursor-pointer accent-orange-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => salva(a)}
                        disabled={row.saving}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap border disabled:opacity-50"
                        style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}
                      >
                        {row.saving ? "Salvo…" : "Salva"}
                      </button>
                      {row.error && <div className="text-xs mt-1" style={{ color: "#991B1B" }}>{row.error}</div>}
                      {row.savedAt && <div className="text-xs mt-1 font-medium" style={{ color: "#15803D" }}>✓ Salvato</div>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
