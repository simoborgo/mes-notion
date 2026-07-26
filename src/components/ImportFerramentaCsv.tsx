"use client";

import { useCallback, useRef, useState, DragEvent, ChangeEvent } from "react";
import Papa from "papaparse";

type Status = "idle" | "parsing" | "matching" | "preview" | "importing" | "done" | "error";

interface DedupItem {
  idProdotto: string;
  descrizione: string;
  unitaMisura: string;
  fornitoreNomeOs1: string;
  codiceFornitore: string;
}

interface MatchedItem extends DedupItem {
  fornitoreId: string | null;
  matchType: "exact" | "partial" | "none";
  giaPresente: boolean;
  skip: boolean;
}

interface FornitoreOption {
  id: string;
  nome: string;
}

const REQUIRED_COLUMNS = ["IdProdotto", "DsProdotto", "IdUM", "RagioneSociale_1"];

function badgeStyle(matchType: MatchedItem["matchType"]) {
  if (matchType === "exact") return { background: "#D1FAE5", color: "#065F46", label: "Match esatto" };
  if (matchType === "partial") return { background: "#FEF9C3", color: "#92400E", label: "Verifica match" };
  return { background: "#FEE2E2", color: "#991B1B", label: "Fornitore non trovato" };
}

export default function ImportFerramentaCsv() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<MatchedItem[]>([]);
  const [fornitoriOptions, setFornitoriOptions] = useState<FornitoreOption[]>([]);
  const [result, setResult] = useState<{ created: number; errors: { idProdotto: string; error: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Seleziona un file CSV");
      setStatus("error");
      return;
    }
    setStatus("parsing");
    setError(null);
    setResult(null);

    try {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
      const fields = parsed.meta.fields ?? [];
      const missing = REQUIRED_COLUMNS.filter(c => !fields.includes(c));
      if (missing.length > 0) {
        throw new Error(`Colonne mancanti nel CSV: ${missing.join(", ")}`);
      }

      // Dedup per IdProdotto — last-write-wins nell'ordine del file.
      // Cod. fornitore fa eccezione: su alcune righe della stessa fattura (es. sconti) è vuoto
      // anche quando per lo stesso prodotto esiste già un valore — l'ultimo non vuoto vince.
      const map = new Map<string, DedupItem>();
      for (const row of parsed.data) {
        const idProdotto = (row["IdProdotto"] ?? "").trim();
        if (!idProdotto) continue;
        const codiceFornitore = (row["Cod. fornitore"] ?? "").trim();
        map.set(idProdotto, {
          idProdotto,
          descrizione: (row["DsProdotto"] ?? "").trim(),
          unitaMisura: (row["IdUM"] ?? "").trim(),
          fornitoreNomeOs1: (row["RagioneSociale_1"] ?? "").trim(),
          codiceFornitore: codiceFornitore || map.get(idProdotto)?.codiceFornitore || "",
        });
      }
      const deduped = Array.from(map.values());
      if (deduped.length === 0) throw new Error("Nessuna riga valida trovata nel CSV");

      setStatus("matching");
      const res = await fetch("/api/admin/import-ferramenta/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: deduped }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Errore durante il match fornitori");

      setFornitoriOptions(data.fornitoriOptions ?? []);
      setItems((data.items as (DedupItem & { fornitoreId: string | null; matchType: MatchedItem["matchType"]; giaPresente: boolean })[]).map(it => ({
        ...it,
        skip: it.giaPresente,
      })));
      setStatus("preview");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }, []);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const onFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }, [processFile]);

  function updateItem(idx: number, patch: Partial<MatchedItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  const doImport = useCallback(async () => {
    const toImport = items.filter(it => !it.skip);
    if (toImport.length === 0) return;
    setStatus("importing");
    setError(null);
    try {
      const res = await fetch("/api/admin/import-ferramenta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: toImport }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Errore import");
      setResult({ created: data.created, errors: data.errors ?? [] });
      setStatus("done");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }, [items]);

  function reset() {
    setStatus("idle");
    setError(null);
    setItems([]);
    setFornitoriOptions([]);
    setResult(null);
  }

  if (status === "done" && result) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
        <div className="text-3xl mb-3">✓</div>
        <h3 className="text-lg font-semibold mb-1" style={{ color: "#166534" }}>Import completato</h3>
        <p className="text-sm mb-4" style={{ color: "#15803d" }}>{result.created} articoli creati</p>
        {result.errors.length > 0 && (
          <div className="text-left max-w-md mx-auto mb-4 text-xs" style={{ color: "#991B1B" }}>
            {result.errors.map(e => <div key={e.idProdotto}>{e.idProdotto}: {e.error}</div>)}
          </div>
        )}
        <button onClick={reset} className="px-4 py-2 rounded text-sm font-medium" style={{ background: "#166534", color: "white" }}>
          Nuovo import
        </button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-xl p-8 text-center" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
        <div className="text-2xl mb-2">⚠</div>
        <p className="text-sm font-medium mb-4" style={{ color: "#991b1b" }}>{error}</p>
        <button onClick={reset} className="px-4 py-2 rounded text-sm font-medium" style={{ background: "#991b1b", color: "white" }}>
          Riprova
        </button>
      </div>
    );
  }

  if (status === "parsing" || status === "matching" || status === "importing") {
    const label = status === "parsing" ? "Lettura CSV…" : status === "matching" ? "Ricerca corrispondenze fornitori…" : "Creazione articoli su Notion…";
    return (
      <div className="rounded-xl p-12 text-center" style={{ border: "2px dashed #e5e4e0" }}>
        <div className="inline-block w-8 h-8 rounded-full border-2 border-t-transparent mb-4 animate-spin" style={{ borderColor: "#6366f1", borderTopColor: "transparent" }} />
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>{label}</p>
      </div>
    );
  }

  if (status === "preview") {
    const daImportare = items.filter(it => !it.skip).length;
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ color: "var(--color-black)" }}>
            Anteprima — {items.length} articoli, {daImportare} da importare
          </h2>
          <button onClick={reset} className="text-xs px-2 py-1 rounded" style={{ color: "#6b6966", border: "1px solid #e5e4e0" }}>
            Cambia CSV
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)", background: "#faf9f7" }}>
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2">Codice OS1</th>
                <th className="px-3 py-2 min-w-[160px]">Descrizione</th>
                <th className="px-3 py-2">UM</th>
                <th className="px-3 py-2 min-w-[180px]">Fornitore</th>
                <th className="px-3 py-2">Cod. Fornitore</th>
                <th className="px-3 py-2">Match</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const badge = badgeStyle(it.matchType);
                return (
                  <tr key={it.idProdotto} className="border-b last:border-0" style={{ opacity: it.skip ? 0.5 : 1 }}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={!it.skip} onChange={(e) => updateItem(idx, { skip: !e.target.checked })} className="w-4 h-4 cursor-pointer accent-orange-500" />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{it.idProdotto}</td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full text-xs px-2 py-1 rounded"
                        style={{ border: "1px solid #e5e4e0", background: "#fafaf9" }}
                        value={it.descrizione}
                        onChange={(e) => updateItem(idx, { descrizione: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-16 text-xs px-2 py-1 rounded"
                        style={{ border: "1px solid #e5e4e0", background: "#fafaf9" }}
                        value={it.unitaMisura}
                        onChange={(e) => updateItem(idx, { unitaMisura: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="w-full text-xs px-2 py-1 rounded"
                        style={{ border: "1px solid #e5e4e0", background: "#fafaf9" }}
                        value={it.fornitoreId ?? ""}
                        onChange={(e) => updateItem(idx, { fornitoreId: e.target.value || null })}
                      >
                        <option value="">— Nessuno —</option>
                        {fornitoriOptions.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                      </select>
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--color-grey-mid)" }}>{it.fornitoreNomeOs1}</div>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-24 text-xs px-2 py-1 rounded"
                        style={{ border: "1px solid #e5e4e0", background: "#fafaf9" }}
                        value={it.codiceFornitore}
                        onChange={(e) => updateItem(idx, { codiceFornitore: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ background: badge.background, color: badge.color }}>
                        {it.giaPresente ? "Già importato" : badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={reset} className="px-4 py-2 rounded text-sm" style={{ color: "#6b6966", border: "1px solid #e5e4e0" }}>
            Annulla
          </button>
          <button
            onClick={doImport}
            disabled={daImportare === 0}
            className="px-5 py-2 rounded text-sm font-semibold disabled:opacity-50"
            style={{ background: "#6366f1", color: "white" }}
          >
            Importa {daImportare} articoli in Notion →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onClick={() => fileInputRef.current?.click()}
      className="rounded-xl p-16 text-center cursor-pointer transition-colors"
      style={{ border: `2px dashed ${dragging ? "#6366f1" : "#e5e4e0"}`, background: dragging ? "#f5f3ff" : "#fafaf9" }}
    >
      <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} />
      <div className="text-4xl mb-3">📦</div>
      <p className="text-sm font-medium" style={{ color: "var(--color-black)" }}>
        Trascina il CSV OS1 qui o clicca per selezionare
      </p>
      <p className="text-xs mt-1" style={{ color: "var(--color-grey-mid)" }}>
        Colonne richieste: IdProdotto, DsProdotto, IdUM, RagioneSociale_1 — opzionale: Cod. fornitore
      </p>
    </div>
  );
}
