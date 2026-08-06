"use client";

import { memo, useCallback, useMemo, useState } from "react";
import type { ArticoloFerramenta, MetodoGestioneFerramenta } from "@/lib/types";
import { UBICAZIONI_FERRAMENTA } from "@/lib/types";
import { normalizzaCodiceFornitore, nomeFornitore } from "@/lib/ferramentaCodici";
import FormNuovoArticoloFerramenta from "./FormNuovoArticoloFerramenta";

const inputCls = "border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

export default function TabellaArticoliFerramenta({
  articoli: initial,
  fornitori,
}: {
  articoli: ArticoloFerramenta[];
  fornitori: { id: string; nome: string; codiceOs1: string }[];
}) {
  const [articoli, setArticoli] = useState(initial);
  const [modalAperto, setModalAperto] = useState(false);
  // Bozza (controlla l'input) vs applicato (guida filtro/render) — con 8358 articoli filtrare
  // ad ogni tasto digitato appesantiva la tabella. Si applica con "Cerca" o Invio nel campo.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return articoli;
    const qNormalizzata = normalizzaCodiceFornitore(search);
    return articoli.filter(a => {
      if (`${a.descrizione} ${a.codiceOs1} ${nomeFornitore(a)} ${a.codiceFornitore} ${a.descrizioneFornitore}`.toLowerCase().includes(q)) return true;
      // Cerca anche per codice fornitore normalizzato: incolla il codice così com'è nel
      // tracciato fornitore (con zeri iniziali/spazi) e lo trova comunque — stessa logica
      // di confronto usata dal matching della Gestione Ordini Wurth.
      if (qNormalizzata && a.codiceFornitore && normalizzaCodiceFornitore(a.codiceFornitore).includes(qNormalizzata)) return true;
      return false;
    });
  }, [articoli, search]);

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
          onKeyDown={(e) => { if (e.key === "Enter") setSearch(searchInput); }}
        />
        <button
          onClick={() => setSearch(searchInput)}
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
              <th className="px-4 py-3">Codice OS1</th>
              <th className="px-4 py-3 min-w-[180px]">Descrizione</th>
              <th className="px-4 py-3">Fornitore</th>
              <th className="px-4 py-3">Cod. Fornitore</th>
              <th className="px-4 py-3">Metodo Gestione</th>
              <th className="px-4 py-3">Qtà Vaschetta</th>
              <th className="px-4 py-3">Soglia Minima</th>
              <th className="px-4 py-3">Giacenza</th>
              <th className="px-4 py-3">Inventariati</th>
              <th className="px-4 py-3">Ubicazione</th>
              <th className="px-4 py-3">Attivo</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-12 text-center text-sm" style={{ color: "var(--color-grey-mid)" }}>
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
