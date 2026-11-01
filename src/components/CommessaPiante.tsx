"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CommessaPianta } from "@/lib/types";
import { generaDerivati, salvaDerivati } from "@/lib/pianteRaster";

const ETICHETTE_COMUNI = ["Piano terra", "Piano 1", "Piano 2", "Interrato", "Soppalco"];
const ALTEZZA_ANTEPRIMA = 250;
const COLORI = { completati: "#16A34A", inLavorazione: "#F59E0B", daIniziare: "#3B82F6" };
const inputCls = "border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 min-h-[44px]";
const linkBtn = "text-[13px] underline px-2 min-h-[44px] disabled:opacity-50";

// Stato degli ODP agganciati alle zone di una pianta (calcolato dalla pagina della commessa).
export interface StatistichePianta { zone: number; odp: number; completati: number; inLavorazione: number; daIniziare: number; senzaOdp: number }

function leggiBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Lettura file non riuscita"));
    r.readAsDataURL(file);
  });
}

const mimeDi = (f: File) => f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : "application/octet-stream");
const dataIt = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });

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

  const box = "flex items-center justify-center text-sm text-center px-4";
  if (errore) return <p className={box} style={{ height: ALTEZZA_ANTEPRIMA, color: "#991B1B" }}>Anteprima non disponibile. Apri la pianta per vederla.</p>;
  if (!src) return <p aria-busy="true" className={`${box} animate-pulse font-semibold`} style={{ height: ALTEZZA_ANTEPRIMA, color: "var(--color-grey-mid)" }}>Preparo l&apos;anteprima…</p>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`Anteprima della pianta ${pianta.etichetta || pianta.nomeFile}`} className="block mx-auto w-auto max-w-full object-contain" style={{ height: ALTEZZA_ANTEPRIMA }} />;
}

function BarraStato({ st }: { st: StatistichePianta }) {
  const voci = [
    { n: st.completati, c: COLORI.completati, t: st.completati === 1 ? "completato" : "completati" },
    { n: st.inLavorazione, c: COLORI.inLavorazione, t: "in lavorazione" },
    { n: st.daIniziare, c: COLORI.daIniziare, t: "da iniziare" },
  ];
  const descr = [...voci.map((v) => `${v.n} ${v.t}`), `${st.senzaOdp} senza ODP`].join(", ");
  return (
    <div>
      <div role="img" aria-label={`Stato degli ODP sulla pianta: ${descr}`} className="flex h-2.5 rounded-full overflow-hidden gap-0.5" style={{ background: "#E4E0DA" }}>
        {voci.filter((v) => v.n > 0).map((v) => <span key={v.t} style={{ flex: v.n, background: v.c }} />)}
        {st.senzaOdp > 0 && <span style={{ flex: st.senzaOdp, background: "repeating-linear-gradient(135deg,#9CA3AF 0 3px,#E4E0DA 3px 6px)" }} />}
      </div>
      <p className="flex flex-wrap gap-x-3.5 mt-1.5 text-xs" style={{ color: "var(--color-grey-mid)" }}>
        {voci.filter((v) => v.n > 0).map((v) => <span key={v.t}><strong style={{ color: "var(--color-black)" }}>{v.n}</strong> {v.t}</span>)}
        {st.senzaOdp > 0 && <span><strong style={{ color: "var(--color-black)" }}>{st.senzaOdp}</strong> senza ODP</span>}
      </p>
    </div>
  );
}

const Freccia = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;

// Tab Pianta: una card per piano. Per guardare la pianta si apre il PDF segnato (semplice e veloce);
// il visualizzatore interattivo serve per le zone cliccabili e per la modifica.
export default function CommessaPiante({ commessaId, piante, statistiche, canEdit }: { commessaId: string; piante: CommessaPianta[]; statistiche: Record<string, StatistichePianta>; canEdit: boolean }) {
  const router = useRouter();
  const nuovoRef = useRef<HTMLInputElement>(null);
  const sostituisciRef = useRef<HTMLInputElement>(null);
  const bersaglioRef = useRef<CommessaPianta | null>(null);
  const [etichettaNuova, setEtichettaNuova] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [fase, setFase] = useState("");

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
    if (nuova) setEtichettaNuova("");
    if (nuovoRef.current) nuovoRef.current.value = "";
  }

  async function sostituisci(file: File) {
    const p = bersaglioRef.current;
    if (!p) return;
    setFase("Carico il file…");
    await chiama(`/api/commesse/${commessaId}/piante/${p.id}`, "PATCH", { fileBase64: await leggiBase64(file), filename: file.name }, (r) => preparaDerivati(file, r.id));
    if (sostituisciRef.current) sostituisciRef.current.value = "";
  }

  async function rinomina(p: CommessaPianta) {
    const e = window.prompt("Piano di questa pianta", p.etichetta);
    if (e === null) return;
    await chiama(`/api/commesse/${commessaId}/piante/${p.id}`, "PATCH", { etichetta: e });
  }

  async function elimina(p: CommessaPianta) {
    if (!window.confirm(`Eliminare la pianta "${p.etichetta || p.nomeFile}"? Il file viene rimosso anche da Drive, con il suo PDF segnato.`)) return;
    await chiama(`/api/commesse/${commessaId}/piante/${p.id}`, "DELETE");
  }

  const accept = "application/pdf,image/png,image/jpeg,image/webp";
  const viewer = (p: CommessaPianta) => `/commesse/${commessaId}/piante/${p.id}`;
  const pdfUrl = (p: CommessaPianta) => p.pdfSegnatoDriveId ? `/api/commesse/${commessaId}/piante/${p.id}/pdf-segnato?v=${p.pdfSegnatoDriveId}` : null;

  return (
    <section className="space-y-4" aria-labelledby="titolo-piante">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 id="titolo-piante" className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>Piante del negozio</h2>
          <p className="text-sm mt-1 max-w-xl" style={{ color: "var(--color-grey-mid)" }}>
            Una pianta per piano. «Apri pianta» mostra il PDF segnato, con le zone che portano alla scheda ODP.
            {canEdit && " Le modifiche si fanno sull'originale: il PDF segnato si aggiorna a ogni «Fine modifica»."}
          </p>
        </div>
        <ul className="flex gap-4 flex-wrap text-xs list-none p-0 m-0" aria-label="Legenda colori delle zone">
          {([["Completato", COLORI.completati], ["In lavorazione", COLORI.inLavorazione], ["Da iniziare", COLORI.daIniziare]] as const).map(([t, c]) => (
            <li key={t} className="flex items-center gap-1.5"><span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: c, display: "inline-block" }} />{t}</li>
          ))}
          <li className="flex items-center gap-1.5"><span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, border: "2px dashed #6B6560", boxSizing: "border-box", display: "inline-block" }} />Senza ODP</li>
        </ul>
      </div>

      {piante.length === 0 && !canEdit && (
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessuna pianta caricata.</p>
      )}

      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 360px), 1fr))" }}>
        {piante.map((p) => {
          const st = statistiche[p.id];
          const pdf = pdfUrl(p);
          const titolo = p.etichetta || p.nomeFile;
          return (
            <article key={p.id} className="rounded-[14px] border bg-white overflow-hidden flex flex-col" style={{ borderColor: "#E4E0DA" }}>
              {pdf
                ? <a href={pdf} target="_blank" rel="noreferrer" aria-label={`Apri il PDF segnato del ${titolo}`} className="relative block py-3 hover:brightness-95" style={{ background: "#F3F0EB" }}>
                    <AnteprimaPianta key={p.driveFileId + p.haAnteprima} pianta={p} />
                    <span className="absolute right-3.5 bottom-3.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white" style={{ background: "var(--color-black)" }}>Apri pianta <Freccia /></span>
                  </a>
                : <Link href={viewer(p)} aria-label={`Apri la pianta del ${titolo}`} className="relative block py-3 hover:brightness-95" style={{ background: "#F3F0EB" }}>
                    <AnteprimaPianta key={p.driveFileId + p.haAnteprima} pianta={p} />
                    <span className="absolute right-3.5 bottom-3.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white" style={{ background: "var(--color-black)" }}>Apri pianta <Freccia /></span>
                  </Link>}
              <div className="px-[18px] pt-4 pb-3.5 flex flex-col gap-3 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[26px] leading-tight font-semibold" style={{ fontFamily: "var(--font-display)" }}>{titolo}</h3>
                  {st && <span className="text-[13px] whitespace-nowrap" style={{ color: "var(--color-grey-mid)" }}><strong style={{ color: "var(--color-black)" }}>{st.zone}</strong> {st.zone === 1 ? "zona" : "zone"} · <strong style={{ color: "var(--color-black)" }}>{st.odp}</strong> ODP</span>}
                </div>
                {st
                  ? <BarraStato st={st} />
                  : <p className="text-xs rounded-lg px-3 py-2" style={{ background: "#FEF3C7", color: "#78350F" }}>Nessuna zona sulla pianta.{canEdit ? " Apri la pianta, premi «Modifica» e disegna le zone." : ""}</p>}
                <p className="text-xs truncate" style={{ color: "var(--color-grey-mid)" }}>{p.nomeFile} · caricata da {p.caricatoDa || "—"} il {dataIt(p.aggiornatoIl)}</p>
                <div className="flex gap-2.5 flex-wrap mt-auto">
                  {pdf
                    ? <>
                        <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg px-4 min-h-[44px] font-bold" style={{ background: "var(--color-primary)", color: "var(--color-black)" }}>
                          Apri pianta <Freccia />
                        </a>
                        <Link href={viewer(p)} className="inline-flex items-center gap-2 rounded-lg border px-3.5 min-h-[44px] font-semibold bg-white" style={{ borderColor: "#CFC9C0" }}>
                          Zone interattive
                        </Link>
                      </>
                    : <Link href={viewer(p)} className="inline-flex items-center gap-2 rounded-lg px-4 min-h-[44px] font-bold" style={{ background: "var(--color-primary)", color: "var(--color-black)" }}>
                        Apri pianta <Freccia />
                      </Link>}
                </div>
                <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
                  {pdf
                    ? `PDF segnato aggiornato il ${p.pdfSegnatoIl ? dataIt(p.pdfSegnatoIl) : "—"}: i colori riflettono lo stato degli ODP di quel giorno.`
                    : canEdit ? "PDF segnato non ancora creato: si crea con «Modifica» › «Fine modifica»." : "PDF segnato non ancora disponibile: si apre il visualizzatore."}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-1.5 items-center border-t px-2.5 py-1" style={{ borderColor: "#EFEBE5", background: "#FAF9F7" }}>
                  <Link href={`${viewer(p)}?modifica=1`} className={`${linkBtn} inline-flex items-center font-semibold`}>✎ Modifica</Link>
                  <button type="button" disabled={busy} className={linkBtn} onClick={() => { bersaglioRef.current = p; sostituisciRef.current?.click(); }}>Sostituisci file</button>
                  <button type="button" disabled={busy} className={linkBtn} onClick={() => rinomina(p)}>Rinomina</button>
                  <button type="button" disabled={busy} className={`${linkBtn} ml-auto`} style={{ color: "#991B1B" }} onClick={() => elimina(p)}>Elimina</button>
                </div>
              )}
            </article>
          );
        })}

        {canEdit && (
          <section aria-labelledby="nuovo-piano" className="rounded-[14px] p-5 flex flex-col gap-3.5 justify-center" style={{ background: "#FAF9F7", border: "2px dashed #CFC9C0" }}>
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="w-10 h-10 rounded-full bg-white border flex items-center justify-center text-xl" style={{ borderColor: "#E4E0DA" }}>+</span>
              <h3 id="nuovo-piano" className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>{piante.length === 0 ? "Carica la pianta del negozio" : "Aggiungi un piano"}</h3>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="piano-nuovo" className="text-xs font-bold">Che piano è?</label>
              <input id="piano-nuovo" className={inputCls} list="etichette-piante" value={etichettaNuova} onChange={(e) => setEtichettaNuova(e.target.value)} placeholder={piante.length === 0 ? "Piano terra" : "Es. Piano 2"} />
              <datalist id="etichette-piante">{ETICHETTE_COMUNI.map((e) => <option key={e} value={e} />)}</datalist>
              <div className="flex gap-1.5 flex-wrap">
                {ETICHETTE_COMUNI.filter((e) => !piante.some((p) => p.etichetta === e)).slice(0, 3).map((e) => (
                  <button key={e} type="button" className="text-xs bg-white border rounded-full px-3 py-1.5 min-h-[32px]" style={{ borderColor: "#CFC9C0" }} onClick={() => setEtichettaNuova(e)}>{e}</button>
                ))}
              </div>
            </div>
            <input ref={nuovoRef} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) aggiungi(f); }} />
            <button type="button" disabled={busy} onClick={() => nuovoRef.current?.click()} className="flex flex-col items-center justify-center gap-1.5 bg-white border rounded-[10px] py-[18px] px-3 disabled:opacity-60" style={{ borderColor: "#CFC9C0" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 20h14" /></svg>
              <strong>{busy ? (fase || "Carico…") : "Scegli il file della pianta"}</strong>
              <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>PDF, PNG o JPG · l&apos;originale resta invariato</span>
            </button>
          </section>
        )}
      </div>

      <input ref={sostituisciRef} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sostituisci(f); }} />
      {busy && fase && piante.length > 0 && <p role="status" className="text-sm font-semibold" style={{ color: "var(--color-grey-mid)" }}>{fase}</p>}
      {errore && <p role="alert" className="text-sm" style={{ color: "#991B1B" }}>{errore}</p>}
    </section>
  );
}
