"use client";

import { memo, useCallback, useMemo, useState } from "react";
import type { ArticoloFerramenta, MetodoGestioneFerramenta } from "@/lib/types";
import { UBICAZIONI_FERRAMENTA } from "@/lib/types";
import { normalizzaCodiceFornitore, nomeFornitore } from "@/lib/ferramentaCodici";
import FormNuovoArticoloFerramenta from "./FormNuovoArticoloFerramenta";

const inputCls = "border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

type SortKey =
  | "codiceOs1" | "descrizione" | "fornitore" | "codiceFornitore" | "descrizioneCategoria"
  | "categoriaMerceologica" | "metodoGestione" | "quantitaStandardVaschetta" | "sogliaMinima"
  | "giacenzaAttuale" | "inventariato" | "ubicazione" | "attivo";
type SortDir = "asc" | "desc";

function valoreOrdinamento(a: ArticoloFerramenta, key: SortKey): string | number | boolean {
  switch (key) {
    case "fornitore": return nomeFornitore(a);
    case "quantitaStandardVaschetta": return a.quantitaStandardVaschetta ?? -1;
    case "sogliaMinima": return a.sogliaMinima ?? -1;
    case "giacenzaAttuale": return a.giacenzaAttuale;
    case "inventariato": return a.inventariato;
    case "attivo": return a.attivo;
    case "metodoGestione": return a.metodoGestione ?? "";
    case "ubicazione": return a.ubicazione ?? "";
    default: return (a[key] as string) ?? "";
  }
}

function cmp(a: ArticoloFerramenta, b: ArticoloFerramenta, key: SortKey, dir: SortDir): number {
  const va = valoreOrdinamento(a, key);
  const vb = valoreOrdinamento(b, key);
  let res: number;
  if (typeof va === "number" && typeof vb === "number") res = va - vb;
  else if (typeof va === "boolean" && typeof vb === "boolean") res = va === vb ? 0 : va ? 1 : -1;
  else res = String(va).localeCompare(String(vb), "it");
  return dir === "asc" ? res : -res;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className="ml-1 inline-block text-[10px] opacity-60">
      {active ? (dir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );
}

function Th({
  label, sortKey: key, currentSortKey, sortDir, onSort, className = "",
}: {
  label: string;
  sortKey: SortKey;
  currentSortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = key === currentSortKey;
  return (
    <th
      className={`px-4 py-3 whitespace-nowrap select-none cursor-pointer hover:bg-orange-50/50 ${className}`}
      onClick={() => onSort(key)}
    >
      {label}
      <SortIcon active={active} dir={active ? sortDir : "asc"} />
    </th>
  );
}

export default function TabellaArticoliFerramenta({
  articoli: initial,
  fornitori,
}: {
  articoli: ArticoloFerramenta[];
  fornitori: { id: string; nome: string; codiceOs1: string }[];
}) {
  const [articoli, setArticoli] = useState(initial);
  const [modalAperto, setModalAperto] = useState(false);
  // Solo la ricerca testuale è "bozza vs applicata" (con 8358 articoli filtrare ad ogni tasto
  // digitato appesantiva la tabella, si applica con "Cerca"/Invio) — il toggle Inventariati è
  // un click singolo, non uno stream: farlo aspettare "Cerca" sembrava un bug (si accende ma
  // non filtra nulla finché non premi anche Cerca), quindi si applica subito.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [soloInventariati, setSoloInventariati] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("descrizione");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function applicaFiltri() {
    setSearch(searchInput);
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const qNormalizzata = normalizzaCodiceFornitore(search);
    return articoli.filter(a => {
      if (soloInventariati && !a.inventariato) return false;
      if (!q) return true;
      if (`${a.descrizione} ${a.codiceOs1} ${nomeFornitore(a)} ${a.codiceFornitore} ${a.descrizioneFornitore}`.toLowerCase().includes(q)) return true;
      // Cerca anche per codice fornitore normalizzato: incolla il codice così com'è nel
      // tracciato fornitore (con zeri iniziali/spazi) e lo trova comunque — stessa logica
      // di confronto usata dal matching della Gestione Ordini Wurth.
      if (qNormalizzata && a.codiceFornitore && normalizzaCodiceFornitore(a.codiceFornitore).includes(qNormalizzata)) return true;
      return false;
    }).sort((a, b) => cmp(a, b, sortKey, sortDir));
  }, [articoli, search, soloInventariati, sortKey, sortDir]);

  function handleArticoloCreato(articolo: ArticoloFerramenta) {
    setArticoli(prev => [articolo, ...prev]);
    setModalAperto(false);
  }

  // Solo il campo che conta per la ricerca/visualizzazione nella riga stessa (codiceFornitore)
  // va riportato nell'array del padre — gli altri campi (metodoGestione, soglie, ecc.) restano
  // stato locale alla riga, quindi digitare in una riga non ri-renderizza le altre 8000+.
  // useCallback con deps vuote (setArticoli è stabile) — senza, una nuova funzione ad ogni
  // render del padre (es. ogni tasto in "searchInput") invaliderebbe il React.memo di TUTTE
  // le righe, perché onSalvato cambierebbe identità e il confronto shallow lo vedrebbe "diverso".
  const handleRigaSalvata = useCallback((id: string, codiceFornitore: string) => {
    setArticoli(prev => prev.map(x => x.id === id ? { ...x, codiceFornitore } : x));
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className={inputCls + " min-w-52"}
          placeholder="Cerca descrizione, codice OS1, cod. fornitore, fornitore…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") applicaFiltri(); }}
        />
        <button
          onClick={() => setSoloInventariati(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded border text-sm font-medium transition-colors"
          style={soloInventariati
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
        <button
          onClick={() => setModalAperto(true)}
          className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--color-primary)" }}
        >
          + Nuovo articolo
        </button>
      </div>

      {modalAperto && (
        <FormNuovoArticoloFerramenta
          fornitori={fornitori}
          onClose={() => setModalAperto(false)}
          onCreato={handleArticoloCreato}
        />
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
              <Th label="Codice OS1" sortKey="codiceOs1" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Descrizione" sortKey="descrizione" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="min-w-[180px]" />
              <Th label="Fornitore" sortKey="fornitore" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Cod. Fornitore" sortKey="codiceFornitore" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Categoria" sortKey="descrizioneCategoria" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Cat. Merceologica" sortKey="categoriaMerceologica" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Metodo Gestione" sortKey="metodoGestione" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Qtà Vaschetta" sortKey="quantitaStandardVaschetta" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Soglia Minima" sortKey="sogliaMinima" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Giacenza" sortKey="giacenzaAttuale" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Inventariati" sortKey="inventariato" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Ubicazione" sortKey="ubicazione" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Attivo" sortKey="attivo" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={14} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
                  Nessun articolo trovato
                </td>
              </tr>
            ) : (
              filtered.map(a => (
                <RigaArticoloFerramenta key={a.id} articolo={a} onSalvato={handleRigaSalvata} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const RigaArticoloFerramenta = memo(function RigaArticoloFerramenta({
  articolo: a, onSalvato,
}: {
  articolo: ArticoloFerramenta;
  onSalvato: (id: string, codiceFornitore: string) => void;
}) {
  const [metodoGestione, setMetodoGestione] = useState<MetodoGestioneFerramenta | "">(a.metodoGestione ?? "");
  const [quantitaStandardVaschetta, setQuantitaStandardVaschetta] = useState(a.quantitaStandardVaschetta != null ? String(a.quantitaStandardVaschetta) : "");
  const [sogliaMinima, setSogliaMinima] = useState(a.sogliaMinima != null ? String(a.sogliaMinima) : "");
  const [attivo, setAttivo] = useState(a.attivo);
  const [ubicazione, setUbicazione] = useState(a.ubicazione ?? "");
  const [codiceFornitore, setCodiceFornitore] = useState(a.codiceFornitore ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function salva() {
    if (metodoGestione === "Kanban" && !(Number(quantitaStandardVaschetta) > 0)) {
      setError("Quantità Standard Vaschetta obbligatoria (> 0) per Kanban");
      return;
    }
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await fetch(`/api/ferramenta/articoli/${a.id}/classificazione`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodoGestione: metodoGestione || null,
          quantitaStandardVaschetta: metodoGestione === "Kanban" && quantitaStandardVaschetta ? Number(quantitaStandardVaschetta) : null,
          sogliaMinima: sogliaMinima ? Number(sogliaMinima) : null,
          attivo,
          ubicazione: ubicazione || null,
          codiceFornitore: codiceFornitore || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      onSalvato(a.id, codiceFornitore);
      setSaving(false);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 3000);
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : "Errore salvataggio");
    }
  }

  return (
    <tr className="border-b last:border-0 align-top">
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
      <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{nomeFornitore(a) || "—"}</td>
      <td className="px-4 py-3">
        <input
          type="text"
          className={inputCls + " w-28"}
          placeholder="—"
          value={codiceFornitore}
          onChange={(e) => setCodiceFornitore(e.target.value)}
        />
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{a.descrizioneCategoria || "—"}</td>
      <td className="px-4 py-3 text-xs font-mono" style={{ color: "var(--color-grey-mid)" }}>{a.categoriaMerceologica || "—"}</td>
      <td className="px-4 py-3">
        <select
          className={inputCls}
          value={metodoGestione}
          onChange={(e) => setMetodoGestione(e.target.value as MetodoGestioneFerramenta | "")}
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
          disabled={metodoGestione !== "Kanban"}
          value={quantitaStandardVaschetta}
          onChange={(e) => setQuantitaStandardVaschetta(e.target.value)}
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number" min="0" step="any"
          className={inputCls + " w-24"}
          value={sogliaMinima}
          onChange={(e) => setSogliaMinima(e.target.value)}
        />
      </td>
      <td className="px-4 py-3 tabular-nums">{a.giacenzaAttuale} {a.unitaMisura}</td>
      <td className="px-4 py-3">
        {a.inventariato ? (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#DCFCE7", color: "#166534" }}>Sì</span>
        ) : (
          <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <select
          className={inputCls}
          value={ubicazione}
          onChange={(e) => setUbicazione(e.target.value)}
        >
          <option value="">—</option>
          {UBICAZIONI_FERRAMENTA.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </td>
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={attivo}
          onChange={(e) => setAttivo(e.target.checked)}
          className="w-4 h-4 cursor-pointer accent-orange-500"
        />
      </td>
      <td className="px-4 py-3">
        <button
          onClick={salva}
          disabled={saving}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap border disabled:opacity-50"
          style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", borderColor: "rgba(240,143,37,0.3)" }}
        >
          {saving ? "Salvo…" : "Salva"}
        </button>
        {error && <div className="text-xs mt-1" style={{ color: "#991B1B" }}>{error}</div>}
        {savedAt && <div className="text-xs mt-1 font-medium" style={{ color: "#15803D" }}>✓ Salvato</div>}
      </td>
    </tr>
  );
});
