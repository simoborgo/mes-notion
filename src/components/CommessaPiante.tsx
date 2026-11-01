"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CommessaPianta } from "@/lib/types";
import { getPdfjsLib } from "@/lib/pdfjsClient";

const ETICHETTE_COMUNI = ["Piano terra", "Piano 1", "Piano 2", "Interrato", "Soppalco"];
const ALTEZZA_ANTEPRIMA = 200;
const inputCls = "border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

function leggiBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Lettura file non riuscita"));
    r.readAsDataURL(file);
  });
}

// Anteprima della prima pagina: canvas per i PDF, img per le immagini. Il file passa dal proxy
// /api/drive-file, quindi si riscarica quando cambia il driveFileId (sostituzione).
function AnteprimaPianta({ pianta }: { pianta: CommessaPianta }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [errore, setErrore] = useState(false);
  const url = `/api/drive-file/${pianta.driveFileId}`;
  const isPdf = pianta.mimeType === "application/pdf";

  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await getPdfjsLib();
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await res.arrayBuffer()) }).promise;
        const page = await pdf.getPage(1);
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const vp0 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (ALTEZZA_ANTEPRIMA / vp0.height) * dpr });
        canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
        canvas.style.height = `${ALTEZZA_ANTEPRIMA}px`; canvas.style.width = "auto";
        await page.render({ canvas, viewport: vp }).promise;
      } catch {
        if (!cancelled) setErrore(true);
      }
    })();
    return () => { cancelled = true; };
  }, [url, isPdf]);

  if (errore) return <p className="p-6 text-sm" style={{ color: "#991B1B" }}>Anteprima non disponibile. Apri il file con il pulsante qui sotto.</p>;
  if (isPdf) return <canvas ref={canvasRef} className="block mx-auto" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={pianta.etichetta || pianta.nomeFile} className="block mx-auto w-auto" style={{ height: ALTEZZA_ANTEPRIMA }} />;
}

// Copertina della scheda commessa: una pianta per piano, con linguette quando sono più d'una.
export default function CommessaPiante({ commessaId, piante, canEdit }: { commessaId: string; piante: CommessaPianta[]; canEdit: boolean }) {
  const router = useRouter();
  const nuovoRef = useRef<HTMLInputElement>(null);
  const sostituisciRef = useRef<HTMLInputElement>(null);
  const [attivaId, setAttivaId] = useState(piante[0]?.id ?? "");
  const [etichettaNuova, setEtichettaNuova] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");

  const attiva = piante.find((p) => p.id === attivaId) ?? piante[0];

  async function chiama(url: string, method: string, body?: unknown): Promise<CommessaPianta | null> {
    setBusy(true); setErrore("");
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Errore");
      router.refresh();
      return json as CommessaPianta;
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function aggiungi(file: File) {
    const nuova = await chiama(`/api/commesse/${commessaId}/piante`, "POST", {
      fileBase64: await leggiBase64(file), filename: file.name,
      etichetta: etichettaNuova.trim() || (piante.length === 0 ? "Piano terra" : ""),
    });
    if (nuova) { setAttivaId(nuova.id); setEtichettaNuova(""); }
    if (nuovoRef.current) nuovoRef.current.value = "";
  }

  async function sostituisci(file: File) {
    if (!attiva) return;
    await chiama(`/api/commesse/${commessaId}/piante/${attiva.id}`, "PATCH", { fileBase64: await leggiBase64(file), filename: file.name });
    if (sostituisciRef.current) sostituisciRef.current.value = "";
  }

  async function rinomina() {
    if (!attiva) return;
    const e = window.prompt("Posizione / piano di questa pianta", attiva.etichetta);
    if (e === null) return;
    await chiama(`/api/commesse/${commessaId}/piante/${attiva.id}`, "PATCH", { etichetta: e });
  }

  async function elimina() {
    if (!attiva) return;
    if (!window.confirm(`Eliminare la pianta "${attiva.etichetta || attiva.nomeFile}"? Il file viene rimosso anche da Drive.`)) return;
    const ok = await chiama(`/api/commesse/${commessaId}/piante/${attiva.id}`, "DELETE");
    if (ok) setAttivaId("");
  }

  const accept = "application/pdf,image/png,image/jpeg,image/webp";

  return (
    <section className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wide mr-2" style={{ color: "var(--color-grey-mid)" }}>Pianta del negozio</span>
          {piante.length > 1 && piante.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setAttivaId(p.id)}
              className="text-xs rounded-full border px-3 py-1"
              style={attiva?.id === p.id ? { background: "var(--color-black)", color: "#fff", borderColor: "var(--color-black)" } : { background: "#fff", color: "var(--color-grey-mid)", borderColor: "#E4E0DA" }}
            >
              {p.etichetta || p.nomeFile}
            </button>
          ))}
          {piante.length === 1 && attiva && <span className="text-sm font-medium">{attiva.etichetta || attiva.nomeFile}</span>}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <input className={inputCls} list="etichette-piante" value={etichettaNuova} onChange={(e) => setEtichettaNuova(e.target.value)} placeholder="Piano (es. Piano 1)" aria-label="Piano della nuova pianta" />
            <datalist id="etichette-piante">{ETICHETTE_COMUNI.map((e) => <option key={e} value={e} />)}</datalist>
            <input ref={nuovoRef} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) aggiungi(f); }} />
            <button type="button" disabled={busy} onClick={() => nuovoRef.current?.click()} className="text-xs underline disabled:opacity-50" style={{ color: "var(--color-primary)" }}>
              {busy ? "Carico…" : "+ Aggiungi pianta"}
            </button>
          </div>
        )}
      </div>

      {attiva ? (
        <>
          <Link href={`/commesse/${commessaId}/piante/${attiva.id}`} className="block bg-gray-50 py-2 hover:bg-gray-100" aria-label="Apri la pianta">
            <AnteprimaPianta key={attiva.driveFileId} pianta={attiva} />
          </Link>
          <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 text-xs flex-wrap" style={{ color: "var(--color-grey-mid)" }}>
            <Link href={`/commesse/${commessaId}/piante/${attiva.id}`} className="font-medium underline" style={{ color: "var(--color-primary)" }}>Apri pianta</Link>
            <span className="truncate">{attiva.nomeFile} · aggiornata il {new Date(attiva.aggiornatoIl).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} da {attiva.caricatoDa || "—"}</span>
            {canEdit && (
              <span className="ml-auto flex items-center gap-3">
                <input ref={sostituisciRef} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sostituisci(f); }} />
                <button type="button" disabled={busy} onClick={() => sostituisciRef.current?.click()} className="underline disabled:opacity-50">Sostituisci file</button>
                <button type="button" disabled={busy} onClick={rinomina} className="underline disabled:opacity-50">Rinomina</button>
                <button type="button" disabled={busy} onClick={elimina} className="underline disabled:opacity-50" style={{ color: "#991B1B" }}>Elimina</button>
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="p-6 text-sm" style={{ color: "var(--color-grey-mid)" }}>
          {canEdit ? "Nessuna pianta. Carica il PDF che arriva dall'ufficio tecnico: se il negozio ha più piani, aggiungine una per piano." : "Nessuna pianta caricata."}
        </p>
      )}
      {errore && <p className="px-4 pb-3 text-xs" style={{ color: "#991B1B" }}>{errore}</p>}
    </section>
  );
}
