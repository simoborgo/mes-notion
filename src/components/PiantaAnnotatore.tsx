"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CommessaPianta, ZonaPianta } from "@/lib/types";
import PdfAnnotabile, { type Annotazioni, type ModoPianta, type ZonaRender } from "./PdfAnnotabile";
import BadgeStato from "./BadgeStato";

export interface OdpPianta {
  id: string;
  odp: string;
  numeroScheda: string;
  statoProduzione: string;
  faseCorrente: string;
}

const COLORI = { nessuno: "#9CA3AF", daIniziare: "#3B82F6", inLavorazione: "#F59E0B", completato: "#16A34A" };

// Stato della zona = stato dell'ODP agganciato: completato → verde con spunta, avviato → arancio,
// da iniziare → blu, annullato o zona senza ODP → grigio tratteggiato.
function statoZona(o: OdpPianta | undefined): { colore: string; tratteggio: boolean; spuntata: boolean } {
  if (!o || o.statoProduzione === "Annullata") return { colore: COLORI.nessuno, tratteggio: true, spuntata: false };
  if (o.statoProduzione === "Completato") return { colore: COLORI.completato, tratteggio: false, spuntata: true };
  if (!o.statoProduzione || o.statoProduzione === "Da Iniziare") return { colore: COLORI.daIniziare, tratteggio: false, spuntata: false };
  return { colore: COLORI.inLavorazione, tratteggio: false, spuntata: false };
}

const etichettaOdp = (o: OdpPianta) => o.odp || o.numeroScheda || "—";
const inputCls = "border rounded px-2 py-1 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-orange-300";

// Pianta annotabile (stesso motore delle spedizioni) con le zone cliccabili agganciate agli ODP.
// Chi non modifica la vede in sola lettura: un clic su una zona apre subito la scheda ODP.
// I segni si salvano da soli 2s dopo l'ultima modifica; le zone si salvano subito.
export default function PiantaAnnotatore({ pianta, iniziali, zoneIniziali, zonaIniziale, odp, schedeConZona, canEdit }: {
  pianta: CommessaPianta; iniziali: Partial<Annotazioni>; zoneIniziali: ZonaPianta[]; zonaIniziale?: string; odp: OdpPianta[];
  schedeConZona: string[]; canEdit: boolean;
}) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoRef = useRef<Annotazioni | null>(null);
  const [stato, setStato] = useState<"" | "salvo" | "salvato" | "errore">("");
  // La pianta si apre sempre in sola visione; chi può modificarla preme "Modifica" per avere gli strumenti.
  const [inModifica, setInModifica] = useState(false);
  const [modo, setModo] = useState<ModoPianta>("zone");
  const [zone, setZone] = useState<ZonaPianta[]>(zoneIniziali);
  const [conZona, setConZona] = useState<Set<string>>(new Set(schedeConZona));
  const [selId, setSelId] = useState<string | null>(zonaIniziale ?? null);
  const [nuova, setNuova] = useState<{ pagina: number; x: number; y: number; w: number; h: number } | null>(null);
  const [errore, setErrore] = useState("");

  const odpPerId = useMemo(() => new Map(odp.map((o) => [o.id, o])), [odp]);

  const zoneRender: ZonaRender[] = useMemo(() => zone.map((z) => {
    const o = z.schedaId ? odpPerId.get(z.schedaId) : undefined;
    return { id: z.id, pagina: z.pagina, x: z.x, y: z.y, w: z.w, h: z.h, ...statoZona(o), etichetta: o ? etichettaOdp(o) : "?", conteggio: null, selezionata: z.id === selId };
  }), [zone, odpPerId, selId]);

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

  // In Vista (anche in sola lettura) il clic su una zona va dritto alla scheda; in Zone la seleziona.
  function onZonaClick(id: string | null) {
    const z = zone.find((x) => x.id === id);
    if (inModifica && modo === "zone") { setSelId(id); return; }
    if (z?.schedaId) router.push(`/schede/${z.schedaId}`);
    else setSelId(id);
  }

  async function confermaNuova(schedaId: string) {
    if (!nuova) return;
    setErrore("");
    const res = await fetch(urlZone, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...nuova, schedaId }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setErrore(json.error ?? "Errore nel salvataggio della zona"); return; }
    setZone((z) => [...z, json as ZonaPianta]);
    setConZona((s) => new Set(s).add(schedaId));
    setSelId((json as ZonaPianta).id);
    setNuova(null);
  }

  async function eliminaZona(z: ZonaPianta) {
    if (!window.confirm("Eliminare questa zona dalla pianta? L'ODP non viene toccato.")) return;
    const res = await fetch(`${urlZone}/${z.id}`, { method: "DELETE" });
    if (!res.ok) { setErrore("Errore nell'eliminazione della zona"); return; }
    const resto = zone.filter((x) => x.id !== z.id);
    setZone(resto);
    setConZona(new Set(resto.map((x) => x.schedaId).filter((x): x is string => !!x)));
    setSelId(null);
  }

  async function cambiaOdp(z: ZonaPianta, schedaId: string) {
    const res = await fetch(`${urlZone}/${z.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedaId }) });
    if (!res.ok) { setErrore("Errore nel cambio di ODP"); return; }
    setZone((lista) => lista.map((x) => (x.id === z.id ? { ...x, schedaId } : x)));
    setConZona((s) => new Set(s).add(schedaId));
  }

  // arrivando dalla scheda ODP ("Vedi sulla pianta") la pianta si apre ingrandita su quella zona
  const [centraSu] = useState(() => {
    const z = zoneIniziali.find((x) => x.id === zonaIniziale);
    return z ? { pagina: z.pagina, x: z.x + z.w / 2, y: z.y + z.h / 2 } : undefined;
  });
  const sel = zone.find((z) => z.id === selId) ?? null;
  const selOdp = sel?.schedaId ? odpPerId.get(sel.schedaId) : undefined;
  const senzaZona = odp.filter((o) => !conZona.has(o.id) && o.statoProduzione !== "Annullata");

  const btnModo = (m: ModoPianta, label: string) => (
    <button
      key={m}
      onClick={() => { setModo(m); setNuova(null); setSelId(null); }}
      style={{ padding: "5px 10px", borderRadius: 4, fontSize: 12, cursor: "pointer", border: "1px solid #E5E4E0", background: modo === m ? "#1A1918" : "#F5F2EE", color: modo === m ? "white" : "#1A1918", fontWeight: modo === m ? 700 : 400 }}
    >{label}</button>
  );
  const btnBase = { padding: "5px 10px", borderRadius: 4, fontSize: 12, cursor: "pointer", border: "1px solid #E5E4E0" } as const;
  const barraModi = canEdit ? (
    inModifica ? (
      <span style={{ display: "inline-flex", gap: 4 }}>
        {btnModo("segni", "Segna")}{btnModo("zone", "Zone")}
        <button onClick={() => { setInModifica(false); setNuova(null); setSelId(null); }} style={{ ...btnBase, background: "#F08F25", color: "white", fontWeight: 700, borderColor: "#F08F25" }}>Fine modifica</button>
      </span>
    ) : (
      <button onClick={() => setInModifica(true)} style={{ ...btnBase, background: "#F5F2EE", color: "#1A1918", fontWeight: 600 }}>✎ Modifica</button>
    )
  ) : undefined;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 min-w-0">
          <PdfAnnotabile
            url={pianta.haVista ? `/api/commesse/${pianta.commessaId}/piante/${pianta.id}/vista?v=${pianta.driveFileId}` : `/api/commesse/${pianta.commessaId}/piante/${pianta.id}/file?v=${pianta.driveFileId}`}
            mimeType={pianta.haVista ? "image/jpeg" : pianta.mimeType}
            iniziali={iniziali}
            onChange={inModifica ? onChange : undefined}
            readOnly={!inModifica}
            modo={inModifica ? modo : "vista"}
            zone={zoneRender}
            onZonaCreata={(r) => { setNuova(r); setSelId(null); }}
            onZonaClick={onZonaClick}
            barraExtra={barraModi}
            centraSu={centraSu}
          />
        </div>

        <aside className="md:w-72 shrink-0 rounded-lg border border-gray-200 bg-white p-3 space-y-3 overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
          {sel ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>Zona</p>
                  {selOdp ? (
                    <Link href={`/schede/${selOdp.id}`} className="font-semibold underline tabular-nums" style={{ color: "var(--color-primary)" }}>{etichettaOdp(selOdp)}</Link>
                  ) : <p className="font-semibold">ODP non agganciato</p>}
                </div>
                <button type="button" className="text-xs underline" onClick={() => setSelId(null)}>Chiudi</button>
              </div>
              {selOdp && (
                <p className="flex items-center gap-2 text-sm">
                  {selOdp.statoProduzione && <BadgeStato stato={selOdp.statoProduzione} />}
                  {selOdp.faseCorrente && <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{selOdp.faseCorrente}</span>}
                </p>
              )}
              {inModifica && (
                <div className="space-y-2 pt-1">
                  <OdpSelect odp={odp} conZona={conZona} value={sel.schedaId ?? ""} onChange={(id) => cambiaOdp(sel, id)} />
                  <button type="button" className="text-xs underline" style={{ color: "#991B1B" }} onClick={() => eliminaZona(sel)}>Elimina zona</button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-grey-mid)" }}>Legenda</p>
              <ul className="text-xs space-y-1">
                {([["Nessun ODP", COLORI.nessuno], ["Da iniziare", COLORI.daIniziare], ["In lavorazione", COLORI.inLavorazione], ["Completato ✓", COLORI.completato]] as const).map(([t, c]) => (
                  <li key={t} className="flex items-center gap-2"><span style={{ width: 12, height: 12, background: c, borderRadius: 2, display: "inline-block" }} />{t}</li>
                ))}
              </ul>
              <p className="text-xs pt-1" style={{ color: "var(--color-grey-mid)" }}>Clicca una zona per aprire la scheda ODP.</p>
              <p className="text-xs font-semibold uppercase tracking-wide pt-2" style={{ color: "var(--color-grey-mid)" }}>ODP senza zona ({senzaZona.length}/{odp.length})</p>
              {senzaZona.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>{odp.length === 0 ? "Questa commessa non ha ancora ODP." : "Tutti gli ODP hanno una zona."}</p>
              ) : (
                <ul className="text-sm space-y-0.5">
                  {senzaZona.map((o) => <li key={o.id}><Link href={`/schede/${o.id}`} className="underline tabular-nums">{etichettaOdp(o)}</Link>{o.numeroScheda && o.odp ? <span style={{ color: "var(--color-grey-mid)" }}> · {o.numeroScheda}</span> : null}</li>)}
                </ul>
              )}
              {inModifica && <p className="text-xs pt-2" style={{ color: "var(--color-grey-mid)" }}><b>Zone</b>: trascina un rettangolo sull&apos;ingombro e scegli l&apos;ODP. <b>Segna</b>: evidenziatore e bolli.</p>}
              <a href={`/api/commesse/${pianta.commessaId}/piante/${pianta.id}/file?v=${pianta.driveFileId}`} target="_blank" rel="noreferrer" className="block text-xs underline pt-2" style={{ color: "var(--color-primary)" }}>Apri il file originale</a>
            </div>
          )}
          {errore && <p className="text-xs" style={{ color: "#991B1B" }}>{errore}</p>}
        </aside>
      </div>
      {nuova && (
        // finestra sopra la pianta: il pannello laterale, sotto i 1024 px, finisce sotto la pagina e non si vede
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.35)" }}>
          <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl space-y-2">
            <NuovaZona odp={odp} conZona={conZona} errore={errore} onConferma={confermaNuova} onAnnulla={() => { setNuova(null); setErrore(""); }} />
          </div>
        </div>
      )}
      {canEdit && (
        <p className="text-[11px] h-4" style={{ color: stato === "errore" ? "#991B1B" : "var(--color-grey-mid)" }}>
          {stato === "salvo" && "Salvataggio…"}{stato === "salvato" && "Segni salvati"}{stato === "errore" && "Errore nel salvataggio dei segni: riprova a modificare"}
        </p>
      )}
    </div>
  );
}

// Elenco ODP con filtro testuale (le commesse grandi ne hanno decine); ✓ = già sulla pianta.
// Righe cliccabili e non un <select size>: la lista nativa è inaffidabile con il tocco e, se vuota, non dice nulla.
function OdpSelect({ odp, conZona, value, onChange }: { odp: OdpPianta[]; conZona: Set<string>; value: string; onChange: (id: string) => void }) {
  const [filtro, setFiltro] = useState("");
  const attivi = odp.filter((o) => o.statoProduzione !== "Annullata");
  const visibili = attivi.filter((o) => !filtro || `${o.odp} ${o.numeroScheda}`.toLowerCase().includes(filtro.toLowerCase()));
  return (
    <div className="space-y-1">
      <input className={inputCls} value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Cerca ODP o n° scheda" aria-label="Cerca ODP" />
      {visibili.length === 0 ? (
        <p className="text-sm py-2" style={{ color: "var(--color-grey-mid)" }}>
          {attivi.length === 0 ? "Questa commessa non ha ancora ODP da agganciare." : "Nessun ODP corrisponde alla ricerca."}
        </p>
      ) : (
        <ul role="listbox" aria-label="ODP della zona" className="max-h-56 overflow-y-auto border rounded divide-y divide-gray-100" style={{ borderColor: "#E4E0DA" }}>
          {visibili.map((o) => {
            const scelto = o.id === value;
            return (
              <li key={o.id} role="option" aria-selected={scelto}>
                <button
                  type="button"
                  onClick={() => onChange(o.id)}
                  className="w-full text-left px-2 py-1.5 text-sm flex items-center justify-between gap-2"
                  style={{ background: scelto ? "rgba(240,143,37,.2)" : "#fff", fontWeight: scelto ? 700 : 400 }}
                >
                  <span className="tabular-nums">{conZona.has(o.id) ? "✓ " : ""}{etichettaOdp(o)}{o.numeroScheda && o.odp ? <span style={{ color: "var(--color-grey-mid)" }}> · {o.numeroScheda}</span> : null}</span>
                  {o.statoProduzione && <span className="text-xs shrink-0" style={{ color: "var(--color-grey-mid)" }}>{o.statoProduzione}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Dopo aver disegnato il rettangolo: scegli l'ODP da agganciare.
function NuovaZona({ odp, conZona, errore, onConferma, onAnnulla }: { odp: OdpPianta[]; conZona: Set<string>; errore: string; onConferma: (schedaId: string) => void; onAnnulla: () => void }) {
  const [schedaId, setSchedaId] = useState("");
  return (
    <div className="space-y-2">
      <p className="font-semibold">Nuova zona: scegli l&apos;ODP</p>
      <OdpSelect odp={odp} conZona={conZona} value={schedaId} onChange={setSchedaId} />
      <p className="text-[11px]" style={{ color: "var(--color-grey-mid)" }}>✓ = ODP già presente sulla pianta (puoi agganciarlo anche a un&apos;altra zona).</p>
      <div className="flex items-center gap-3">
        <button type="button" disabled={!schedaId} onClick={() => onConferma(schedaId)} className="text-sm px-3 py-1.5 rounded font-medium text-white disabled:opacity-40" style={{ background: "var(--color-primary)" }}>Aggancia</button>
        <button type="button" className="text-xs underline ml-auto" onClick={onAnnulla}>Annulla</button>
      </div>
      {errore && <p className="text-xs" style={{ color: "#991B1B" }}>{errore}</p>}
    </div>
  );
}
