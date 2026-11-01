"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CommessaPianta } from "@/lib/types";
import { generaDerivati, salvaDerivati } from "@/lib/pianteRaster";

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

const mimeDi = (f: File) => f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : "application/octet-stream");

// Miniatura leggera salvata nel database: la tab non scarica né legge il PDF. Se manca (pianta
// caricata prima di questa funzione) la genera una volta nel browser, dopo il primo paint, e la salva.
function AnteprimaPianta({ pianta }: { pianta: CommessaPianta }) {
  const urlSalvata = `/api/commesse/${pianta.commessaId}/piante/${pianta.id}/anteprima?v=${encodeURIComponent(pianta.aggiornatoIl)}`;
  const [src, setSrc] = useState<string | null>(pianta.haAnteprima ? urlSalvata : null);
  const [errore, setErrore] = useState(false);

  useEffect(() => {
    // anche la "vista" veloce può mancare: si rigenera una sola volta per sessione, non a ogni visita
    const chiave = `pianta-derivati-${pianta.id}-${pianta.driveFileId}`;
    let giaTentato = false;
    try { giaTentato = sessionStorage.getItem(chiave) === "1"; } catch { /* storage non disponibile */ }
    if ((pianta.haAnteprima && pianta.haVista) || giaTentato) return;
    let cancelled = false;
    const avvio = setTimeout(async () => {
      try {
        try { sessionStorage.setItem(chiave, "1"); } catch { /* storage non disponibile */ }
        const res = await fetch(`/api/commesse/${pianta.commessaId}/piante/${pianta.id}/file?v=${pianta.driveFileId}`);
        if (!res.ok) throw new Error();
        const derivati = await generaDerivati(await res.blob(), pianta.mimeType);
        if (cancelled) return;
        if (!pianta.haAnteprima) setSrc(URL.createObjectURL(derivati.anteprima));
        await salvaDerivati(pianta.commessaId, pianta.id, derivati).catch(() => {});
      } catch {
        if (!cancelled && !pianta.haAnteprima) setErrore(true);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(avvio); };
  }, [pianta]);

  if (errore) return <p className="p-6 text-sm" style={{ color: "#991B1B" }}>Anteprima non disponibile. Apri la pianta con il pulsante qui sotto.</p>;
  if (!src) return <p className="flex items-center justify-center text-sm animate-pulse" style={{ height: ALTEZZA_ANTEPRIMA, color: "var(--color-grey-mid)" }}>Preparo l&apos;anteprima…</p>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={pianta.etichetta || pianta.nomeFile} className="block mx-auto w-auto" style={{ height: ALTEZZA_ANTEPRIMA }} />;
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
  const [fase, setFase] = useState("");

  const attiva = piante.find((p) => p.id === attivaId) ?? piante[0];

  async function chiama(url: string, method: string, body?: unknown, dopo?: (r: CommessaPianta) => Promise<void>): Promise<CommessaPianta | null> {
    setBusy(true); setErrore("");
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Errore");
      if (dopo) await dopo(json as CommessaPianta);
      router.refresh();
      return json as CommessaPianta;
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore");
      return null;
    } finally {
      setBusy(false); setFase("");
    }
  }

  // Immagine di visione e miniatura si ricavano dal file già in mano al browser (niente nuovo
  // download da Drive); se falliscono la pianta è comunque caricata e si apre dal PDF.
  async function preparaDerivati(file: File, piantaId: string) {
    setFase("Preparo la pianta per la visione veloce…");
    try { await salvaDerivati(commessaId, piantaId, await generaDerivati(file, mimeDi(file))); } catch (e) { console.error("[piante] derivati:", e); }
  }

  async function aggiungi(file: File) {
    setFase("Carico il file…");
    const nuova = await chiama(`/api/commesse/${commessaId}/piante`, "POST", {
      fileBase64: await leggiBase64(file), filename: file.name,
      etichetta: etichettaNuova.trim() || (piante.length === 0 ? "Piano terra" : ""),
    }, (r) => preparaDerivati(file, r.id));
    if (nuova) { setAttivaId(nuova.id); setEtichettaNuova(""); }
    if (nuovoRef.current) nuovoRef.current.value = "";
  }

  async function sostituisci(file: File) {
    if (!attiva) return;
    setFase("Carico il file…");
    await chiama(`/api/commesse/${commessaId}/piante/${attiva.id}`, "PATCH", { fileBase64: await leggiBase64(file), filename: file.name }, (r) => preparaDerivati(file, r.id));
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
              {busy ? (fase || "Carico…") : "+ Aggiungi pianta"}
            </button>
          </div>
        )}
      </div>

      {attiva ? (
        <>
          <Link href={`/commesse/${commessaId}/piante/${attiva.id}`} className="block bg-gray-50 py-2 hover:bg-gray-100" aria-label="Apri la pianta">
            <AnteprimaPianta key={attiva.driveFileId + attiva.haAnteprima} pianta={attiva} />
          </Link>
          <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 text-xs flex-wrap" style={{ color: "var(--color-grey-mid)" }}>
            <Link href={`/commesse/${commessaId}/piante/${attiva.id}`} className="font-medium underline" style={{ color: "var(--color-primary)" }}>Apri pianta</Link>
            <a href={`/commesse/${commessaId}/piante/${attiva.id}`} target="_blank" rel="noopener" className="underline" style={{ color: "var(--color-primary)" }}>Apri in nuova finestra ↗</a>
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
