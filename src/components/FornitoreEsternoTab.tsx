"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { Giro, Ritiro, Scheda } from "@/lib/types";
import { STATI_GIRO } from "@/lib/types";
import { MODIFICA_SCHEDA_ROLES, RITIRI_CREATE_ROLES, type Role } from "@/lib/roles";
import BadgeStato from "./BadgeStato";
import FormNuovoRitiro from "./FormNuovoRitiro";

interface Fornitore { id: string; nome: string }

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

function oggi() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function giorniDiRitardo(g: Giro): number {
  if (g.stato === "Rientrato" || !g.dataRientroPrevista) return 0;
  const ms = new Date(oggi()).getTime() - new Date(g.dataRientroPrevista).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

function Mancante() {
  return <span className="font-bold px-1.5 py-0.5 rounded" style={{ background: "#FEF3C7", color: "#92400E" }}>MANCANTE</span>;
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "#f8f7f5", border: "1px solid #ebe9e5" }}>
      <div className="text-[12.1px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9c9894" }}>{label}</div>
      {children}
    </div>
  );
}

function Titolo({ children, azione }: { children: React.ReactNode; azione?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-2">
      <h3 className="text-[12.1px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>{children}</h3>
      {azione}
    </div>
  );
}

const bottoneSecondario = "text-[13.2px] px-3 py-1.5 rounded-lg font-semibold border transition-colors disabled:opacity-50";
const stileSecondario = { color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.3)", background: "rgba(240,143,37,0.06)" };

interface Props {
  scheda: Scheda;
  userRole?: Role;
  onSchedaAggiornata?: (updated: Scheda) => void;
}

export default function FornitoreEsternoTab({ scheda, userRole, onSchedaAggiornata }: Props) {
  const canEdit = !!userRole && MODIFICA_SCHEDA_ROLES.includes(userRole);
  const canMovimenti = !!userRole && RITIRI_CREATE_ROLES.includes(userRole);
  const [schedaLive, setSchedaLive] = useState(scheda);

  const [giri, setGiri] = useState<Giro[] | null>(null);
  const [ritiri, setRitiri] = useState<Ritiro[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [errore, setErrore] = useState("");
  const [occupato, setOccupato] = useState(false);
  const [showNuovoMovimento, setShowNuovoMovimento] = useState(false);

  const giroSel = giri?.find((g) => g.id === selId) ?? null;
  const [form, setForm] = useState({
    fornitoreId: null as string | null,
    lavorazione: "",
    stato: "",
    dataUscita: "",
    dataRientroPrevista: "",
    dataRientroEffettiva: "",
    note: "",
  });
  const formDa = (g: Giro) => ({
    fornitoreId: g.fornitoreId, lavorazione: g.lavorazione, stato: g.stato, dataUscita: g.dataUscita ?? "",
    dataRientroPrevista: g.dataRientroPrevista ?? "", dataRientroEffettiva: g.dataRientroEffettiva ?? "", note: g.note,
  });
  const isDirty = !!giroSel && JSON.stringify(form) !== JSON.stringify(formDa(giroSel));

  const carica = useCallback(async (preferito?: string | null) => {
    const [rg, rr] = await Promise.all([
      fetch(`/api/schede/${scheda.id}/giri`),
      fetch(`/api/schede/${scheda.id}/ritiri`),
    ]);
    if (!rg.ok) throw new Error("Errore lettura giri");
    const lista: Giro[] = await rg.json();
    setGiri(lista);
    setRitiri(rr.ok ? await rr.json() : []);
    setSelId((cur) => {
      const scelto = preferito ?? cur;
      if (scelto && lista.some((g) => g.id === scelto)) return scelto;
      const aperto = [...lista].reverse().find((g) => g.stato !== "Rientrato");
      return (aperto ?? lista[lista.length - 1])?.id ?? null;
    });
  }, [scheda.id]);

  useEffect(() => {
    let annullato = false;
    (async () => {
      try { await carica(); } catch { if (!annullato) setErrore("Impossibile leggere i giri esterni."); }
    })();
    return () => { annullato = true; };
  }, [carica]);

  // Il modulo si riallinea al giro selezionato quando cambia giro o i suoi dati (aggiornamento
  // di stato durante il rendering, il modo previsto da React per derivare stato da altro stato).
  const chiaveGiro = giroSel ? `${giroSel.id}|${JSON.stringify(formDa(giroSel))}` : null;
  const [chiaveForm, setChiaveForm] = useState<string | null>(null);
  if (chiaveGiro !== chiaveForm) {
    setChiaveForm(chiaveGiro);
    if (giroSel) setForm(formDa(giroSel));
  }

  useEffect(() => {
    if (!canEdit && !canMovimenti) return;
    fetch("/api/fornitori").then((r) => r.json()).then(setFornitori).catch(() => {});
  }, [canEdit, canMovimenti]);

  // Il riepilogo sulla scheda (fornitore, stato, date) segue il giro attivo: dopo ogni modifica
  // si rilegge la scheda per tenere allineati badge e avvisi di ritardo fuori da questa tab.
  async function aggiornaScheda() {
    const r = await fetch(`/api/schede/${scheda.id}`);
    if (!r.ok) return;
    const updated: Scheda = await r.json();
    setSchedaLive(updated);
    onSchedaAggiornata?.(updated);
  }

  async function esegui(fn: () => Promise<Response>, preferito?: string | null) {
    setOccupato(true);
    setErrore("");
    try {
      const res = await fn();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Operazione non riuscita");
      await carica(preferito ?? (data && typeof data === "object" && "id" in data ? (data as Giro).id : undefined));
      await aggiornaScheda();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Operazione non riuscita");
    } finally {
      setOccupato(false);
    }
  }

  const json = { "Content-Type": "application/json" };
  const nuovoGiro = () => esegui(() => fetch(`/api/schede/${scheda.id}/giri`, { method: "POST", headers: json, body: JSON.stringify({ stato: "Da Ordinare" }) }));
  const salva = () => giroSel && esegui(() => fetch(`/api/schede/${scheda.id}/giri/${giroSel.id}`, { method: "PATCH", headers: json, body: JSON.stringify(form) }), giroSel.id);
  function elimina() {
    if (!giroSel) return;
    if (!confirm(`Eliminare il giro ${giroSel.ordine}? I movimenti collegati restano in Ritiri e Consegne, senza giro.`)) return;
    esegui(() => fetch(`/api/schede/${scheda.id}/giri/${giroSel.id}`, { method: "DELETE" }), null);
  }
  const segnaUscita = () => setForm((f) => ({ ...f, stato: "In Lavorazione", dataUscita: f.dataUscita || oggi() }));
  const segnaRientro = () => setForm((f) => ({ ...f, stato: "Rientrato", dataRientroEffettiva: f.dataRientroEffettiva || oggi() }));

  const fotoInputRef = useRef<HTMLInputElement>(null);
  async function caricaFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !giroSel) return;
    await esegui(async () => {
      const foto_base64 = await Promise.all(files.map(readAsBase64));
      return fetch(`/api/schede/${scheda.id}/giri/${giroSel.id}/foto`, { method: "POST", headers: json, body: JSON.stringify({ foto_base64 }) });
    }, giroSel.id);
  }
  const eliminaFoto = (fotoId: string) => {
    if (!giroSel || !confirm("Eliminare questa foto?")) return;
    esegui(() => fetch(`/api/schede/${scheda.id}/giri/${giroSel.id}/foto/${fotoId}`, { method: "DELETE" }), giroSel.id);
  };

  // ── Ordine Fornitore (allegati della scheda, non del singolo giro) ──
  const [uploadingOrdineFornitore, setUploadingOrdineFornitore] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const ordineFornitoreInputRef = useRef<HTMLInputElement>(null);

  async function handleOrdineFornitoreUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingOrdineFornitore(true);
    setUploadError("");
    try {
      const pdfBase64 = await readAsBase64(file);
      const res = await fetch(`/api/schede/${scheda.id}/ordine-fornitore`, {
        method: "POST", headers: json, body: JSON.stringify({ pdfBase64, filename: file.name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore caricamento Ordine Fornitore");
      setSchedaLive(data as Scheda);
      onSchedaAggiornata?.(data as Scheda);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore caricamento Ordine Fornitore");
    } finally {
      setUploadingOrdineFornitore(false);
    }
  }

  async function handleRemoveOrdineFornitore(fileId: string) {
    if (!confirm("Eliminare questo Ordine Fornitore?")) return;
    setRemovingId(fileId);
    setUploadError("");
    try {
      const res = await fetch(`/api/schede/${scheda.id}/ordine-fornitore/${fileId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Errore eliminazione Ordine Fornitore");
      setSchedaLive(data as Scheda);
      onSchedaAggiornata?.(data as Scheda);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore eliminazione Ordine Fornitore");
    } finally {
      setRemovingId(null);
    }
  }

  const inputCls = "w-full text-[15.4px] px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-orange-300 transition-shadow";
  const inputStyle = { border: "1px solid #e5e4e0", background: "white", color: "var(--color-black)" };

  const OrdineFornitoreCard = (
    <div>
      <Titolo>Ordine Fornitore</Titolo>
      <Card label="PDF ordine">
        <div className="flex flex-col gap-1.5 mb-2">
          {schedaLive.pdfOrdineFornitore.length > 0 ? schedaLive.pdfOrdineFornitore.map((pdf, i) => (
            <div key={pdf.id ?? i} className="flex items-center gap-1.5">
              <a href={pdf.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-[15.4px] font-medium transition-colors hover:opacity-80 flex-1 min-w-0"
                style={{ borderColor: "#c7d2fe", color: "#4338ca", background: "#eef2ff" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" />
                </svg>
                <span className="truncate">{pdf.name || `Ordine Fornitore ${i > 0 ? i + 1 : ""}`}</span>
              </a>
              {canEdit && pdf.id && (
                <button type="button" onClick={() => handleRemoveOrdineFornitore(pdf.id!)} disabled={removingId === pdf.id}
                  title="Elimina" className="shrink-0 text-[15.4px] leading-none disabled:opacity-50" style={{ color: "var(--color-grey-mid)" }}>
                  ✕
                </button>
              )}
            </div>
          )) : <Mancante />}
        </div>
        {canEdit && (
          <>
            <input ref={ordineFornitoreInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleOrdineFornitoreUpload} />
            <button type="button" onClick={() => ordineFornitoreInputRef.current?.click()} disabled={uploadingOrdineFornitore}
              className={bottoneSecondario} style={stileSecondario}>
              {uploadingOrdineFornitore ? "Carico…" : "+ Aggiungi Ordine Fornitore"}
            </button>
            {uploadError && <p className="text-[13.2px] mt-1.5" style={{ color: "#DC2626" }}>{uploadError}</p>}
          </>
        )}
      </Card>
    </div>
  );

  if (giri === null) {
    return <p className="text-[15.4px]" style={{ color: "var(--color-grey-mid)" }}>{errore || "Carico i giri…"}</p>;
  }

  const movimentiGiro = ritiri.filter((r) => r.giroId === giroSel?.id);
  const movimentiSenzaGiro = ritiri.filter((r) => !r.giroId);
  const ritardo = giroSel ? giorniDiRitardo(giroSel) : 0;

  return (
    <section className="space-y-5">
      {/* ── Striscia del ciclo: Modar → giro → Modar → giro … ── */}
      <div>
        <Titolo azione={canEdit && (
          <button type="button" onClick={nuovoGiro} disabled={occupato} className={bottoneSecondario} style={stileSecondario}>+ Nuovo giro</button>
        )}>
          Ciclo di lavorazione
        </Titolo>
        {giri.length === 0 ? (
          <div className="rounded-xl px-4 py-6 text-center" style={{ border: "1px dashed #d6d3cd", color: "var(--color-grey-mid)" }}>
            <div className="text-[15.4px] font-semibold" style={{ color: "var(--color-black)" }}>Nessun giro esterno</div>
            <p className="text-[13.2px] mt-1">Quando una parte della lavorazione va da un fornitore, aggiungi un giro: potrai aggiungerne altri a ogni rientro.</p>
          </div>
        ) : (
          <div className="flex items-stretch gap-2 flex-wrap">
            <Nodo etichetta="Modar" tono="modar" />
            {giri.map((g) => {
              const rientrato = g.stato === "Rientrato";
              const sel = g.id === selId;
              const tardi = giorniDiRitardo(g) > 0;
              return (
                <Fragment key={g.id}>
                  <span className="self-center" style={{ color: "#9c9894" }}>→</span>
                  <button type="button" onClick={() => setSelId(g.id)}
                    className="rounded-xl px-3 py-2 text-left transition-colors"
                    style={{
                      minWidth: 150,
                      background: sel ? "#FFF7ED" : "white",
                      border: `1.5px solid ${sel ? "var(--color-primary)" : tardi ? "#FCA5A5" : "#e5e4e0"}`,
                    }}>
                    <div className="text-[12.1px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>Giro {g.ordine}</div>
                    <div className="text-[15.4px] font-semibold truncate" style={{ maxWidth: 220 }}>{g.fornitore || "Fornitore da definire"}</div>
                    {g.lavorazione && <div className="text-[13.2px] truncate" style={{ color: "var(--color-grey-mid)", maxWidth: 220 }}>{g.lavorazione}</div>}
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      {g.stato ? <BadgeStato stato={g.stato} /> : <span className="text-[13.2px]" style={{ color: "#9c9894" }}>senza stato</span>}
                      {tardi && <span className="text-[12.1px] font-bold" style={{ color: "#DC2626" }}>+{giorniDiRitardo(g)} gg</span>}
                    </div>
                  </button>
                  {rientrato
                    ? <><span className="self-center" style={{ color: "#9c9894" }}>→</span><Nodo etichetta="Modar" tono="modar" /></>
                    : <><span className="self-center" style={{ color: "#d6d3cd" }}>⇢</span><Nodo etichetta="Rientro" tono="atteso" /></>}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      {errore && <p className="text-[13.2px] font-medium" style={{ color: "#DC2626" }}>{errore}</p>}

      {/* ── Dettaglio del giro selezionato ── */}
      {giroSel && (
        <div className="rounded-xl p-4 space-y-4" style={{ border: "1px solid #e5e4e0" }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-[17.6px] font-semibold">
              Giro {giroSel.ordine}{giroSel.fornitore ? ` · ${giroSel.fornitore}` : ""}
            </h3>
            {canEdit && (
              <div className="flex gap-2 flex-wrap">
                {giroSel.stato !== "In Lavorazione" && giroSel.stato !== "Rientrato" && (
                  <button type="button" onClick={segnaUscita} className={bottoneSecondario} style={stileSecondario}>Segna uscita oggi</button>
                )}
                {giroSel.stato !== "Rientrato" && (
                  <button type="button" onClick={segnaRientro} className={bottoneSecondario} style={stileSecondario}>Segna rientro oggi</button>
                )}
                <button type="button" onClick={elimina} disabled={occupato} className={bottoneSecondario} style={{ color: "#DC2626", borderColor: "#fecaca", background: "white" }}>Elimina giro</button>
              </div>
            )}
          </div>

          {ritardo > 0 && (
            <div className="rounded-lg px-3 py-2 text-[15.4px] font-medium" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B" }}>
              ⚠ Rientro in ritardo di {ritardo} {ritardo === 1 ? "giorno" : "giorni"}: previsto il {fmt(giroSel.dataRientroPrevista)}.
            </div>
          )}

          {canEdit ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              <Card label="Fornitore">
                <select className={inputCls} style={inputStyle} value={form.fornitoreId ?? ""} onChange={(e) => setForm((f) => ({ ...f, fornitoreId: e.target.value || null }))}>
                  <option value="">— nessuno —</option>
                  {fornitori.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </Card>
              <Card label="Lavorazione">
                <input className={inputCls} style={inputStyle} placeholder="es. Verniciatura" value={form.lavorazione} onChange={(e) => setForm((f) => ({ ...f, lavorazione: e.target.value }))} />
              </Card>
              <Card label="Stato">
                <select className={inputCls} style={inputStyle} value={form.stato} onChange={(e) => setForm((f) => ({ ...f, stato: e.target.value }))}>
                  <option value="">— nessuno —</option>
                  {STATI_GIRO.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Card>
              <Card label="Uscita materiale">
                <input type="date" className={inputCls} style={inputStyle} value={form.dataUscita} onChange={(e) => setForm((f) => ({ ...f, dataUscita: e.target.value }))} />
              </Card>
              <Card label="Rientro previsto">
                <input type="date" className={inputCls} style={inputStyle} value={form.dataRientroPrevista} onChange={(e) => setForm((f) => ({ ...f, dataRientroPrevista: e.target.value }))} />
              </Card>
              <Card label="Rientro effettivo">
                <input type="date" className={inputCls} style={inputStyle} value={form.dataRientroEffettiva} onChange={(e) => setForm((f) => ({ ...f, dataRientroEffettiva: e.target.value }))} />
              </Card>
              <div className="sm:col-span-2 xl:col-span-3">
                <Card label="Note">
                  <textarea className={inputCls} style={inputStyle} rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
                </Card>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              <Card label="Fornitore">{giroSel.fornitore || <Mancante />}</Card>
              <Card label="Lavorazione">{giroSel.lavorazione || "—"}</Card>
              <Card label="Stato">{giroSel.stato ? <BadgeStato stato={giroSel.stato} /> : <Mancante />}</Card>
              <Card label="Uscita materiale">{fmt(giroSel.dataUscita)}</Card>
              <Card label="Rientro previsto">{giroSel.dataRientroPrevista ? fmt(giroSel.dataRientroPrevista) : <Mancante />}</Card>
              <Card label="Rientro effettivo">{fmt(giroSel.dataRientroEffettiva)}</Card>
              {giroSel.note && <div className="sm:col-span-2 xl:col-span-3"><Card label="Note"><span className="whitespace-pre-wrap">{giroSel.note}</span></Card></div>}
            </div>
          )}

          {canEdit && (
            <div className="flex justify-end">
              <button type="button" onClick={salva} disabled={!isDirty || occupato}
                className="text-[15.4px] px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ background: "var(--color-primary)", color: "white" }}>
                {occupato ? "Salvataggio…" : "Salva modifiche"}
              </button>
            </div>
          )}

          {/* Foto del giro */}
          <div>
            <Titolo azione={canEdit && (
              <>
                <input ref={fotoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={caricaFoto} />
                <button type="button" onClick={() => fotoInputRef.current?.click()} disabled={occupato} className={bottoneSecondario} style={stileSecondario}>+ Aggiungi foto</button>
              </>
            )}>
              Foto del giro
            </Titolo>
            {giroSel.foto.length === 0 ? (
              <p className="text-[13.2px]" style={{ color: "var(--color-grey-mid)" }}>Nessuna foto per questo giro.</p>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {giroSel.foto.map((f) => (
                  <div key={f.id} className="relative">
                    <a href={f.url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt="Foto del giro" className="rounded-lg object-cover" style={{ width: 110, height: 110, border: "1px solid #e5e4e0" }} />
                    </a>
                    {canEdit && (
                      <button type="button" onClick={() => eliminaFoto(f.id)} title="Elimina foto"
                        className="absolute top-1 right-1 w-6 h-6 rounded-full text-[13.2px] leading-none"
                        style={{ background: "rgba(255,255,255,0.9)", color: "#DC2626" }}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Movimenti del giro */}
          <div>
            <Titolo azione={canMovimenti && (
              <button type="button" onClick={() => setShowNuovoMovimento(true)} className={bottoneSecondario} style={stileSecondario}>Pianifica consegna / ritiro</button>
            )}>
              Movimenti del giro
            </Titolo>
            <TabellaMovimenti movimenti={movimentiGiro} vuoto="Nessun movimento pianificato per questo giro." />
          </div>
        </div>
      )}

      {movimentiSenzaGiro.length > 0 && (
        <div>
          <Titolo>Movimenti non collegati a un giro</Titolo>
          <TabellaMovimenti movimenti={movimentiSenzaGiro} vuoto="" />
        </div>
      )}

      {OrdineFornitoreCard}

      {showNuovoMovimento && (
        <FormNuovoRitiro
          schede={[schedaLive]}
          fornitori={fornitori}
          initialScheda={schedaLive}
          initialGiroId={giroSel?.id ?? null}
          onClose={() => setShowNuovoMovimento(false)}
          onCreated={() => { setShowNuovoMovimento(false); void carica(); }}
        />
      )}
    </section>
  );
}

function Nodo({ etichetta, tono }: { etichetta: string; tono: "modar" | "atteso" }) {
  return (
    <span className="self-center rounded-full px-3 py-1 text-[13.2px] font-bold"
      style={tono === "modar"
        ? { background: "#EDE9E3", color: "#4b4741" }
        : { border: "1px dashed #d6d3cd", color: "#9c9894" }}>
      {etichetta}
    </span>
  );
}

function TabellaMovimenti({ movimenti, vuoto }: { movimenti: Ritiro[]; vuoto: string }) {
  if (movimenti.length === 0) return vuoto ? <p className="text-[13.2px]" style={{ color: "var(--color-grey-mid)" }}>{vuoto}</p> : null;
  return (
    <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid #ebe9e5" }}>
      <table className="w-full text-[15.4px]">
        <thead>
          <tr style={{ background: "#f8f7f5" }}>
            {["Data", "Movimento", "Stato", "Colli", "Descrizione"].map((h) => (
              <th key={h} className="text-left px-3 py-2 text-[12.1px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {movimenti.map((r) => (
            <tr key={r.id} style={{ borderTop: "1px solid #ebe9e5" }}>
              <td className="px-3 py-2 tabular-nums">{fmt(r.dataTrasporto)}</td>
              <td className="px-3 py-2 font-medium">{r.tipoMovimento || "—"}</td>
              <td className="px-3 py-2"><BadgeStato stato={r.stato} /></td>
              <td className="px-3 py-2 tabular-nums">{r.nrCollo != null || r.totColli != null ? `${r.nrCollo ?? "—"}/${r.totColli ?? "—"}` : "—"}</td>
              <td className="px-3 py-2">{r.causale}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
