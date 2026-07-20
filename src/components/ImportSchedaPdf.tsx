"use client";

import { useRef, useState, useCallback, DragEvent, ChangeEvent } from "react";

interface ParsedItem {
  numeroScheda: string;
  commessaNr: string;
  termineDiConsegna: string | null;
  dataOrdine: string | null;
  tipologia?: string;
  codiceArticolo?: string | null;
  posizione?: string | null;
  fornitore?: string | null;
  quantita?: number | null;
  stato?: string;
  includeAsSubitem?: boolean;
  otherFields?: Record<string, string>;
}

type Status = "idle" | "extracting" | "parsing" | "preview" | "importing" | "done" | "error";

interface ImportResult {
  odp: string;
  created: Array<{ odp: string; pageId: string; numeroScheda: string; tipologia: string }>;
  n8nError?: string;
}

async function getPdfjsLib() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).__pdfjsLib) return (window as any).__pdfjsLib as typeof import("pdfjs-dist");
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__pdfjsLib = pdfjsLib;
  return pdfjsLib;
}

async function extractPdfData(file: File): Promise<{ text: string; thumbnailBase64: string }> {
  const pdfjs = await getPdfjsLib();
  const buf = await file.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise as any;

  const textParts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = await page.getTextContent() as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageText = content.items.map((it: any) => it.str).join(" ");
    textParts.push(pageText);
  }

  // Render first page as thumbnail
  const page1 = await pdf.getPage(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vp0 = page1.getViewport({ scale: 1 }) as any;
  const scale = 1200 / vp0.width;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vp = page1.getViewport({ scale }) as any;
  const canvas = document.createElement("canvas");
  canvas.width = vp.width;
  canvas.height = vp.height;
  const ctx = canvas.getContext("2d")!;
  await page1.render({ canvasContext: ctx, viewport: vp }).promise;
  const thumbnailBase64 = canvas.toDataURL("image/jpeg", 0.92);

  return { text: textParts.join("\n\n"), thumbnailBase64 };
}

function fieldRow(
  label: string,
  value: string,
  onChange: (v: string) => void,
  type: "text" | "date" = "text",
) {
  return (
    <div key={label} className="flex gap-2 items-center" style={{ minHeight: 32 }}>
      <label className="text-xs shrink-0" style={{ color: "#6b6966", width: 180 }}>
        {label}
      </label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 text-xs px-2 py-1 rounded"
        style={{
          border: "1px solid #e5e4e0",
          background: "#fafaf9",
          color: "var(--color-black)",
        }}
      />
    </div>
  );
}

export default function ImportSchedaPdf() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [thumbnailBase64, setThumbnailBase64] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Seleziona un file PDF");
      setStatus("error");
      return;
    }

    setStatus("extracting");
    setError(null);
    setResult(null);

    try {
      // Read PDF as base64 for later upload
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setPdfBase64(base64);

      // Extract text + thumbnail via pdfjs
      const { text, thumbnailBase64: thumb } = await extractPdfData(file);
      setThumbnailBase64(thumb);

      setStatus("parsing");

      // Call Claude API parse endpoint
      const res = await fetch("/api/admin/import-scheda/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfText: text }),
      });
      const data = (await res.json()) as { ok: boolean; items?: ParsedItem[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Errore parsing");

      setItems((data.items ?? []).map((it: ParsedItem, idx: number) => {
        const isExternal = !!(it.fornitore && it.fornitore.toUpperCase() !== "MODAR");
        return {
          ...it,
          stato: it.stato ?? (isExternal ? "In Lavorazione Esterna" : "In Lavorazione"),
          includeAsSubitem: idx === 0 ? undefined : isExternal,
        };
      }));
      setStatus("preview");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const onFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      e.target.value = "";
    },
    [processFile],
  );

  const updateItem = useCallback(
    (idx: number, field: keyof ParsedItem, value: string | number | boolean | null) => {
      setItems((prev) =>
        prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
      );
    },
    [],
  );

  const doImport = useCallback(async () => {
    if (!pdfBase64 || !items.length) return;
    setStatus("importing");
    setError(null);
    try {
      const res = await fetch("/api/admin/import-scheda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [items[0], ...items.slice(1).filter((it) => it.includeAsSubitem === true)],
          pdfBase64,
          thumbnailBase64,
        }),
      });
      const data = (await res.json()) as { ok: boolean; odp?: string; created?: ImportResult["created"]; error?: string; n8nError?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Errore import");
      setResult({ odp: data.odp!, created: data.created!, n8nError: data.n8nError });
      setStatus("done");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }, [pdfBase64, items, thumbnailBase64]);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setThumbnailBase64(null);
    setPdfBase64(null);
    setItems([]);
    setResult(null);
  }, []);

  if (status === "done" && result) {
    return (
      <div
        className="rounded-xl p-8 text-center"
        style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}
      >
        <div className="text-3xl mb-3">✓</div>
        <h3 className="text-lg font-semibold mb-1" style={{ color: "#166534" }}>
          Import completato
        </h3>
        <p className="text-sm mb-4" style={{ color: "#15803d" }}>
          ODP assegnato: <strong>{result.odp}</strong>
        </p>
        <div className="text-left max-w-md mx-auto mb-4">
          {result.created.map((c) => (
            <div
              key={c.pageId}
              className="flex items-center justify-between text-sm py-1"
              style={{ borderBottom: "1px solid #dcfce7" }}
            >
              <span style={{ color: "#166534" }}>
                <span className="text-xs px-1.5 py-0.5 rounded mr-2" style={{ background: "#dcfce7" }}>
                  {c.tipologia}
                </span>
                {c.numeroScheda}
              </span>
              <a
                href={`https://notion.so/${c.pageId.replace(/-/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline"
                style={{ color: "#15803d" }}
              >
                Notion →
              </a>
            </div>
          ))}
        </div>
        {result.n8nError && (
          <p className="text-xs mb-3" style={{ color: "#92400e" }}>
            Avviso n8n: {result.n8nError}
          </p>
        )}
        <button
          onClick={reset}
          className="px-4 py-2 rounded text-sm font-medium"
          style={{ background: "#166534", color: "white" }}
        >
          Nuovo import
        </button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className="rounded-xl p-8 text-center"
        style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
      >
        <div className="text-2xl mb-2">⚠</div>
        <p className="text-sm font-medium mb-4" style={{ color: "#991b1b" }}>
          {error}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded text-sm font-medium"
          style={{ background: "#991b1b", color: "white" }}
        >
          Riprova
        </button>
      </div>
    );
  }

  if (status === "extracting" || status === "parsing") {
    return (
      <div className="rounded-xl p-12 text-center" style={{ border: "2px dashed #e5e4e0" }}>
        <div
          className="inline-block w-8 h-8 rounded-full border-2 border-t-transparent mb-4 animate-spin"
          style={{ borderColor: "#6366f1", borderTopColor: "transparent" }}
        />
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
          {status === "extracting" ? "Estrazione testo dal PDF…" : "Analisi metadati con AI…"}
        </p>
      </div>
    );
  }

  if (status === "importing") {
    return (
      <div className="rounded-xl p-12 text-center" style={{ border: "2px dashed #e5e4e0" }}>
        <div
          className="inline-block w-8 h-8 rounded-full border-2 border-t-transparent mb-4 animate-spin"
          style={{ borderColor: "#6366f1", borderTopColor: "transparent" }}
        />
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>
          Creazione pagine Notion e upload file…
        </p>
      </div>
    );
  }

  if (status === "preview" && items.length > 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ color: "var(--color-black)" }}>
            Anteprima — verifica e correggi i dati estratti
          </h2>
          <button
            onClick={reset}
            className="text-xs px-2 py-1 rounded"
            style={{ color: "#6b6966", border: "1px solid #e5e4e0" }}
          >
            Cambia PDF
          </button>
        </div>

        <div className="flex gap-6 flex-wrap">
          {/* Thumbnail */}
          {thumbnailBase64 && (
            <div className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnailBase64}
                alt="Prima pagina PDF"
                style={{
                  width: 200,
                  border: "1px solid #e5e4e0",
                  borderRadius: 8,
                  objectFit: "contain",
                  background: "white",
                }}
              />
            </div>
          )}

          {/* Items form */}
          <div className="flex-1 min-w-0 space-y-6">
            {items.map((item, idx) => {
              const excluded = idx > 0 && item.includeAsSubitem === false;
              return (
              <div
                key={idx}
                className="rounded-lg p-4"
                style={{
                  border: `1px solid ${excluded ? "#f0efed" : "#e5e4e0"}`,
                  background: excluded ? "#f8f7f5" : "#fafaf9",
                  opacity: excluded ? 0.55 : 1,
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  {idx === 0 ? (
                    <span
                      className="text-xs px-2 py-0.5 rounded font-medium"
                      style={{ background: "#e0e7ff", color: "#3730a3" }}
                    >
                      Scheda principale
                    </span>
                  ) : (
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={item.includeAsSubitem === true}
                        onChange={(e) => updateItem(idx, "includeAsSubitem", e.target.checked)}
                        style={{ accentColor: "#6366f1", width: 14, height: 14 }}
                      />
                      <span
                        className="text-xs px-2 py-0.5 rounded font-medium"
                        style={{
                          background: item.includeAsSubitem ? "#fef9c3" : "#f3f4f6",
                          color: item.includeAsSubitem ? "#854d0e" : "#9ca3af",
                        }}
                      >
                        {item.includeAsSubitem ? `Sottoscheda ${idx}` : `Pagina ${idx} — esclusa`}
                      </span>
                    </label>
                  )}
                </div>

                <div className="space-y-2">
                  {fieldRow("Numero Scheda *", item.numeroScheda, (v) => updateItem(idx, "numeroScheda", v))}
                  {fieldRow("Commessa Nr *", item.commessaNr, (v) => updateItem(idx, "commessaNr", v))}
                  {fieldRow("Posizione", item.posizione ?? "", (v) => updateItem(idx, "posizione", v || null))}
                  {fieldRow("Codice Articolo", item.codiceArticolo ?? "", (v) => updateItem(idx, "codiceArticolo", v || null))}
                  {fieldRow("Fornitore", item.fornitore ?? "", (v) => updateItem(idx, "fornitore", v || null))}
                  {fieldRow("Data Consegna Prevista", item.termineDiConsegna ?? "", (v) => updateItem(idx, "termineDiConsegna", v || null), "date")}
                  {fieldRow("Data Ordine", item.dataOrdine ?? "", (v) => updateItem(idx, "dataOrdine", v || null), "date")}
                  <div className="flex gap-2 items-center">
                    <label className="text-xs shrink-0" style={{ color: "#6b6966", width: 180 }}>
                      Quantità
                    </label>
                    <input
                      type="number"
                      value={item.quantita ?? ""}
                      onChange={(e) => updateItem(idx, "quantita", e.target.value ? Number(e.target.value) : null)}
                      className="w-24 text-xs px-2 py-1 rounded"
                      style={{ border: "1px solid #e5e4e0", background: "#fafaf9", color: "var(--color-black)" }}
                    />
                  </div>

                  <div className="flex gap-2 items-center">
                    <label className="text-xs shrink-0 font-medium" style={{ color: "#6b6966", width: 180 }}>
                      Stato iniziale *
                    </label>
                    <select
                      value={item.stato ?? "In Lavorazione"}
                      onChange={(e) => updateItem(idx, "stato", e.target.value)}
                      className="text-xs px-2 py-1 rounded"
                      style={{ border: "1px solid #e5e4e0", background: "#fafaf9", color: "var(--color-black)" }}
                    >
                      <option value="In Lavorazione">In Lavorazione</option>
                      <option value="In Lavorazione Esterna">In Lavorazione Esterna</option>
                    </select>
                  </div>

                  {item.otherFields && Object.keys(item.otherFields).length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs cursor-pointer" style={{ color: "#6b6966" }}>
                        Altri campi estratti ({Object.keys(item.otherFields).length}) → body n8n
                      </summary>
                      <div className="mt-2 space-y-1 pl-2" style={{ borderLeft: "2px solid #e5e4e0" }}>
                        {Object.entries(item.otherFields).map(([k, v]) => (
                          <div key={k} className="text-xs" style={{ color: "#6b6966" }}>
                            <span className="font-medium">{k}:</span>{" "}
                            {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "")}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 rounded text-sm"
            style={{ color: "#6b6966", border: "1px solid #e5e4e0" }}
          >
            Annulla
          </button>
          <button
            onClick={doImport}
            className="px-5 py-2 rounded text-sm font-semibold"
            style={{ background: "#6366f1", color: "white" }}
          >
            Importa in Notion →
          </button>
        </div>
      </div>
    );
  }

  // Idle — drop zone
  return (
    <div
      onDrop={onDrop}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onClick={() => fileInputRef.current?.click()}
      className="rounded-xl p-16 text-center cursor-pointer transition-colors"
      style={{
        border: `2px dashed ${dragging ? "#6366f1" : "#e5e4e0"}`,
        background: dragging ? "#f5f3ff" : "#fafaf9",
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={onFileChange}
      />
      <div className="text-4xl mb-3">📄</div>
      <p className="text-sm font-medium" style={{ color: "var(--color-black)" }}>
        Trascina il PDF qui o clicca per selezionare
      </p>
      <p className="text-xs mt-1" style={{ color: "var(--color-grey-mid)" }}>
        Scheda di produzione in formato PDF — i metadati vengono estratti automaticamente
      </p>
    </div>
  );
}
