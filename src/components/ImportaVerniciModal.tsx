"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Anteprima {
  totaleRighe: number;
  nuovi: string[];
  daAggiornare: string[];
  invariate: number;
}

interface Risultato {
  inseriteONuove: number;
  invariate: number;
  bilancioDecodificato: number;
  bilancioSconosciuto: number;
  clientiVisti: string[];
}

const inputCls = "text-sm";
const btnBase = "px-4 py-2 text-sm rounded font-semibold border disabled:opacity-50 transition-colors";

// Import CSV OS1 da UI, stessa logica e stesse garanzie di scripts/importa-vernici.mjs (mai
// DELETE/TRUNCATE) — sempre in due passi: prima anteprima (sola lettura), poi conferma esplicita.
export default function ImportaVerniciModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [anteprima, setAnteprima] = useState<Anteprima | null>(null);
  const [risultato, setRisultato] = useState<Risultato | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function analizza() {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("csv", file);
      const res = await fetch("/api/verniciatura/vernici/importa", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setAnteprima(data.anteprima);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'analisi del CSV.");
    } finally {
      setLoading(false);
    }
  }

  async function conferma() {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("csv", file);
      form.append("conferma", "true");
      const res = await fetch("/api/verniciatura/vernici/importa", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Errore ${res.status}`);
      setRisultato(data.risultato);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'importazione.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-lg bg-white rounded-lg shadow-2xl overflow-y-auto max-h-[90vh]" style={{ borderRadius: "var(--radius-modal)" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-start justify-between" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(219,39,119,0.06))" }}>
          <div>
            <h2 className="font-semibold text-base">Importa vernici da OS1</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
              Estratto CSV dell&apos;inventario vernici. Non elimina mai nulla: solo nuove vernici o backfill di cliente/bilancio massa mancanti su quelle esistenti.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {!risultato && (
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-grey-mid)" }}>File CSV</label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className={inputCls}
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setAnteprima(null); setError(""); }}
              />
            </div>
          )}

          {anteprima && !risultato && (
            <div className="rounded-lg border p-3 space-y-2" style={{ background: "#faf9f7", borderColor: "#E4E0DA" }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>Anteprima ({anteprima.totaleRighe} righe nel file)</p>
              <div className="text-sm">
                <b>{anteprima.nuovi.length}</b> vernici nuove da inserire
                {anteprima.nuovi.length > 0 && (
                  <span className="block text-xs mt-1 font-mono" style={{ color: "var(--color-grey-mid)" }}>
                    {anteprima.nuovi.slice(0, 20).join(", ")}{anteprima.nuovi.length > 20 ? ", …" : ""}
                  </span>
                )}
              </div>
              <div className="text-sm"><b>{anteprima.daAggiornare.length}</b> esistenti da aggiornare (solo cliente/bilancio massa mancanti)</div>
              <div className="text-sm"><b>{anteprima.invariate}</b> esistenti invariate</div>
              {anteprima.nuovi.length === 0 && anteprima.daAggiornare.length === 0 && (
                <p className="text-xs" style={{ color: "#166534" }}>Nulla da importare: il catalogo è già allineato a questo file.</p>
              )}
            </div>
          )}

          {risultato && (
            <div className="rounded-lg border p-3 space-y-2" style={{ background: "#D1FAE5", borderColor: "#86EFAC" }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#065F46" }}>Import completato</p>
              <div className="text-sm" style={{ color: "#065F46" }}>
                <div><b>{risultato.inseriteONuove}</b> vernici inserite o aggiornate</div>
                <div><b>{risultato.invariate}</b> invariate</div>
                <div>Bilancio di massa decodificato: {risultato.bilancioDecodificato} · sigla sconosciuta: {risultato.bilancioSconosciuto}</div>
                {risultato.clientiVisti.length > 0 && <div>Clienti visti: {risultato.clientiVisti.join(", ")}</div>}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            {risultato ? (
              <button onClick={onClose} className={btnBase} style={{ color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}>Chiudi</button>
            ) : (
              <>
                <button onClick={onClose} className={btnBase} style={{ color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}>Annulla</button>
                {!anteprima ? (
                  <button onClick={analizza} disabled={!file || loading} className={btnBase + " text-white"} style={{ background: "linear-gradient(135deg, #7C3AED, #DB2777)", borderColor: "transparent" }}>
                    {loading ? "Analizzo…" : "Analizza"}
                  </button>
                ) : (
                  <button onClick={conferma} disabled={loading} className={btnBase + " text-white"} style={{ background: "#166534", borderColor: "transparent" }}>
                    {loading ? "Importo…" : "Conferma import"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
