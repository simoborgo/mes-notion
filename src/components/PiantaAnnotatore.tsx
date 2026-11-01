"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Area, CommessaPianta, ZonaPianta } from "@/lib/types";
import PdfAnnotabile, { type Annotazioni, type ModoPianta, type ZonaRender } from "./PdfAnnotabile";
import BadgeStato from "./BadgeStato";

export interface OdpPianta {
  id: string;
  odp: string;
  numeroScheda: string;
  statoProduzione: string;
  faseCorrente: string;
  areaId: string | null;
}

const COLORI = { nessuno: "#9CA3AF", daIniziare: "#3B82F6", inLavorazione: "#F59E0B", completato: "#16A34A" };

// Stato della zona = riassunto degli ODP dell'area: tutti completati → verde, almeno uno avviato
// → arancio, tutti da iniziare → blu, nessun ODP → grigio tratteggiato.
function coloreZona(odp: OdpPianta[]): { colore: string; tratteggio: boolean } {
  const attivi = odp.filter((o) => o.statoProduzione !== "Annullata");
  if (attivi.length === 0) return { colore: COLORI.nessuno, tratteggio: true };
  if (attivi.every((o) => o.statoProduzione === "Completato")) return { colore: COLORI.completato, tratteggio: false };
  if (attivi.every((o) => !o.statoProduzione || o.statoProduzione === "Da Iniziare")) return { colore: COLORI.daIniziare, tratteggio: false };
  return { colore: COLORI.inLavorazione, tratteggio: false };
}

const etichettaArea = (a: Area) => a.posizione || a.nomeArredo || "Area senza nome";
const inputCls = "border rounded px-2 py-1 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-orange-300";

// Pianta annotabile (stesso motore delle spedizioni) con le zone cliccabili agganciate alle Aree.
// I segni si salvano da soli 2s dopo l'ultima modifica; le zone si salvano subito.
export default function PiantaAnnotatore({ pianta, iniziali, zoneIniziali, aree, odp, areeConZona, canEdit, canCreaArea }: {
  pianta: CommessaPianta; iniziali: Partial<Annotazioni>; zoneIniziali: ZonaPianta[]; aree: Area[]; odp: OdpPianta[];
  areeConZona: string[]; canEdit: boolean; canCreaArea: boolean;
}) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoRef = useRef<Annotazioni | null>(null);
  const [stato, setStato] = useState<"" | "salvo" | "salvato" | "errore">("");
  const [modo, setModo] = useState<ModoPianta>("vista");
  const [zone, setZone] = useState<ZonaPianta[]>(zoneIniziali);
  const [conZona, setConZona] = useState<Set<string>>(new Set(areeConZona));
  const [selId, setSelId] = useState<string | null>(null);
  const [nuova, setNuova] = useState<{ pagina: number; x: number; y: number; w: number; h: number } | null>(null);
  const [errore, setErrore] = useState("");

  const areaPerId = useMemo(() => new Map(aree.map((a) => [a.id, a])), [aree]);
  const odpPerArea = useMemo(() => {
    const m = new Map<string, OdpPianta[]>();
    for (const o of odp) if (o.areaId) m.set(o.areaId, [...(m.get(o.areaId) ?? []), o]);
    return m;
  }, [odp]);

  const zoneRender: ZonaRender[] = useMemo(() => zone.map((z) => {
    const area = z.areaId ? areaPerId.get(z.areaId) : undefined;
    const lista = z.areaId ? odpPerArea.get(z.areaId) ?? [] : [];
    const { colore, tratteggio } = area ? coloreZona(lista) : { colore: COLORI.nessuno, tratteggio: true };
    return { id: z.id, pagina: z.pagina, x: z.x, y: z.y, w: z.w, h: z.h, colore, tratteggio, etichetta: area ? etichettaArea(area) : "?", conteggio: lista.length || null, selezionata: z.id === selId };
  }), [zone, areaPerId, odpPerArea, selId]);

  const salva = useCallback(async () => {
    const a = ultimoRef.current;
    if (!a) return;
    setStato("salvo");
    try {
      const res = await fetch(`/api/commesse/${pianta.commessaId}/piante/${pianta.id}/annotazioni`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strokes: a.strokes, stamps: a.stamps }),
      });
      setStato(res.ok ? "salvato" : "errore");
    } catch {
      setStato("errore");
    }
  }, [pianta.commessaId, pianta.id]);

  const onChange = useCallback((a: Annotazioni) => {
    ultimoRef.current = a;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(salva, 2000);
  }, [salva]);

  // Chiudendo la pagina con una modifica non ancora salvata, la salva subito.
  useEffect(() => () => {
    if (timerRef.current) { clearTimeout(timerRef.current); void salva(); }
  }, [salva]);

  const urlZone = `/api/commesse/${pianta.commessaId}/piante/${pianta.id}/zone`;

  async function confermaNuova(areaId: string) {
    if (!nuova) return;
    setErrore("");
    const res = await fetch(urlZone, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...nuova, areaId }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setErrore(json.error ?? "Errore nel salvataggio della zona"); return; }
    setZone((z) => [...z, json as ZonaPianta]);
    setConZona((s) => new Set(s).add(areaId));
    setSelId((json as ZonaPianta).id);
    setNuova(null);
  }

  async function eliminaZona(z: ZonaPianta) {
    if (!window.confirm("Eliminare questa zona dalla pianta? L'area e i suoi ODP non vengono toccati.")) return;
    const res = await fetch(`${urlZone}/${z.id}`, { method: "DELETE" });
    if (!res.ok) { setErrore("Errore nell'eliminazione della zona"); return; }
    setZone((lista) => lista.filter((x) => x.id !== z.id));
    setSelId(null);
    router.refresh();
  }

  async function cambiaArea(z: ZonaPianta, areaId: string) {
    const res = await fetch(`${urlZone}/${z.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ areaId }) });
    if (!res.ok) { setErrore("Errore nel cambio di area"); return; }
    setZone((lista) => lista.map((x) => (x.id === z.id ? { ...x, areaId } : x)));
    setConZona((s) => new Set(s).add(areaId));
  }

  const sel = zone.find((z) => z.id === selId) ?? null;
  const selArea = sel?.areaId ? areaPerId.get(sel.areaId) : undefined;
  const selOdp = sel?.areaId ? odpPerArea.get(sel.areaId) ?? [] : [];
  const senzaZona = aree.filter((a) => !conZona.has(a.id));

  const btnModo = (m: ModoPianta, label: string) => (
    <button
      key={m}
      onClick={() => { setModo(m); setNuova(null); }}
      style={{ padding: "5px 10px", borderRadius: 4, fontSize: 12, cursor: "pointer", border: "1px solid #E5E4E0", background: modo === m ? "#1A1918" : "#F5F2EE", color: modo === m ? "white" : "#1A1918", fontWeight: modo === m ? 700 : 400 }}
    >{label}</button>
  );
  const barraModi = canEdit ? <span style={{ display: "inline-flex", gap: 4 }}>{btnModo("vista", "Vista")}{btnModo("segni", "Segna")}{btnModo("zone", "Zone")}</span> : undefined;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex-1 min-w-0">
          <PdfAnnotabile
            url={`/api/drive-file/${pianta.driveFileId}`}
            mimeType={pianta.mimeType}
            iniziali={iniziali}
            onChange={canEdit ? onChange : undefined}
            readOnly={!canEdit}
            modo={canEdit ? modo : "vista"}
            zone={zoneRender}
            onZonaCreata={(r) => { setNuova(r); setSelId(null); }}
            onZonaClick={setSelId}
            barraExtra={barraModi}
          />
        </div>

        <aside className="lg:w-80 shrink-0 rounded-lg border border-gray-200 bg-white p-3 space-y-3 overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
          {nuova ? (
            <NuovaZona aree={aree} conZona={conZona} commessaId={pianta.commessaId} canCreaArea={canCreaArea} onConferma={confermaNuova} onAnnulla={() => setNuova(null)} />
          ) : sel ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>Zona</p>
                  <p className="font-semibold">{selArea ? etichettaArea(selArea) : "Area non agganciata"}</p>
                  {selArea && selArea.posizione && selArea.nomeArredo && <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{selArea.nomeArredo}</p>}
                </div>
                <button type="button" className="text-xs underline" onClick={() => setSelId(null)}>Chiudi</button>
              </div>
              {selOdp.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>{selArea ? "Nessun ODP su questa area." : "Scegli l'area a cui agganciarla."}</p>
              ) : (
                <ul className="divide-y divide-gray-100 border rounded" style={{ borderColor: "#E4E0DA" }}>
                  {selOdp.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
                      <Link href={`/schede/${o.id}`} className="underline font-medium tabular-nums" style={{ color: "var(--color-primary)" }}>{o.odp || o.numeroScheda || "—"}</Link>
                      <span className="flex items-center gap-1">{o.faseCorrente && <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{o.faseCorrente}</span>}{o.statoProduzione && <BadgeStato stato={o.statoProduzione} />}</span>
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <div className="space-y-2 pt-1">
                  <select className={inputCls} value={sel.areaId ?? ""} onChange={(e) => e.target.value && cambiaArea(sel, e.target.value)} aria-label="Area della zona">
                    <option value="">— Scegli area —</option>
                    {aree.map((a) => <option key={a.id} value={a.id}>{etichettaArea(a)}{a.posizione && a.nomeArredo ? ` — ${a.nomeArredo}` : ""}</option>)}
                  </select>
                  <button type="button" className="text-xs underline" style={{ color: "#991B1B" }} onClick={() => eliminaZona(sel)}>Elimina zona</button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>Legenda</p>
              <ul className="text-xs space-y-1">
                {([["Nessun ODP", COLORI.nessuno], ["Da iniziare", COLORI.daIniziare], ["In lavorazione", COLORI.inLavorazione], ["Completato", COLORI.completato]] as const).map(([t, c]) => (
                  <li key={t} className="flex items-center gap-2"><span style={{ width: 12, height: 12, background: c, borderRadius: 2, display: "inline-block" }} />{t}</li>
                ))}
              </ul>
              <p className="text-xs font-semibold uppercase tracking-wide pt-2" style={{ color: "var(--color-grey-mid)" }}>Aree senza zona ({senzaZona.length}/{aree.length})</p>
              {senzaZona.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>{aree.length === 0 ? "Questa commessa non ha ancora aree." : "Tutte le aree hanno una zona."}</p>
              ) : (
                <ul className="text-sm space-y-0.5">
                  {senzaZona.map((a) => <li key={a.id}>{etichettaArea(a)}{a.posizione && a.nomeArredo ? <span style={{ color: "var(--color-grey-mid)" }}> — {a.nomeArredo}</span> : null}</li>)}
                </ul>
              )}
              {canEdit && <p className="text-xs pt-2" style={{ color: "var(--color-grey-mid)" }}>Modalità <b>Zone</b>: trascina un rettangolo sull&apos;ingombro dell&apos;arredo. <b>Segna</b>: evidenziatore e bolli. <b>Vista</b>: clicca le zone.</p>}
            </div>
          )}
          {errore && <p className="text-xs" style={{ color: "#991B1B" }}>{errore}</p>}
        </aside>
      </div>
      {canEdit && (
        <p className="text-[11px] h-4" style={{ color: stato === "errore" ? "#991B1B" : "var(--color-grey-mid)" }}>
          {stato === "salvo" && "Salvataggio…"}{stato === "salvato" && "Segni salvati"}{stato === "errore" && "Errore nel salvataggio dei segni: riprova a modificare"}
        </p>
      )}
    </div>
  );
}

// Dopo aver disegnato il rettangolo: scegli l'area esistente oppure creane una con il codice del keyplan.
function NuovaZona({ aree, conZona, commessaId, canCreaArea, onConferma, onAnnulla }: {
  aree: Area[]; conZona: Set<string>; commessaId: string; canCreaArea: boolean; onConferma: (areaId: string) => void; onAnnulla: () => void;
}) {
  const router = useRouter();
  const [areaId, setAreaId] = useState("");
  const [creaNuova, setCreaNuova] = useState(false);
  const [codice, setCodice] = useState("");
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");

  async function creaEConferma() {
    if (!codice.trim() && !nome.trim()) { setErrore("Inserisci almeno il codice keyplan o il nome"); return; }
    setBusy(true); setErrore("");
    try {
      const res = await fetch("/api/aree", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commessaId, nomeArredo: nome, posizione: codice }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Errore creazione area");
      router.refresh();
      onConferma((json as Area).id);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="font-semibold">Nuova zona</p>
      {!creaNuova ? (
        <>
          <select className={inputCls} value={areaId} onChange={(e) => setAreaId(e.target.value)} aria-label="Area da agganciare">
            <option value="">— Scegli area —</option>
            {aree.map((a) => <option key={a.id} value={a.id}>{conZona.has(a.id) ? "✓ " : ""}{etichettaArea(a)}{a.posizione && a.nomeArredo ? ` — ${a.nomeArredo}` : ""}</option>)}
          </select>
          <p className="text-[11px]" style={{ color: "var(--color-grey-mid)" }}>✓ = già presente sulla pianta (puoi comunque agganciarne un&apos;altra zona).</p>
          <div className="flex items-center gap-3">
            <button type="button" disabled={!areaId} onClick={() => onConferma(areaId)} className="text-sm px-3 py-1.5 rounded font-medium text-white disabled:opacity-40" style={{ background: "var(--color-primary)" }}>Aggancia</button>
            {canCreaArea && <button type="button" className="text-xs underline" onClick={() => setCreaNuova(true)}>+ Nuova area</button>}
            <button type="button" className="text-xs underline ml-auto" onClick={onAnnulla}>Annulla</button>
          </div>
        </>
      ) : (
        <>
          <input className={inputCls} value={codice} onChange={(e) => setCodice(e.target.value)} placeholder="Codice keyplan (es. A12)" aria-label="Codice keyplan" />
          <input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome arredo (facoltativo)" aria-label="Nome arredo" />
          <div className="flex items-center gap-3">
            <button type="button" disabled={busy} onClick={creaEConferma} className="text-sm px-3 py-1.5 rounded font-medium text-white disabled:opacity-40" style={{ background: "var(--color-primary)" }}>{busy ? "Creo…" : "Crea e aggancia"}</button>
            <button type="button" className="text-xs underline" onClick={() => setCreaNuova(false)}>Indietro</button>
            <button type="button" className="text-xs underline ml-auto" onClick={onAnnulla}>Annulla</button>
          </div>
        </>
      )}
      {errore && <p className="text-xs" style={{ color: "#991B1B" }}>{errore}</p>}
    </div>
  );
}
