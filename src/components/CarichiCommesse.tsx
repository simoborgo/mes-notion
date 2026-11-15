"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Carico, Commessa, Scheda } from "@/lib/types";
import BadgeStato from "./BadgeStato";
import SchedaCard, { coloreDaTesto } from "./SchedaCard";
import FormCarico from "./FormCarico";

// Pagina unica Carichi: panoramica per commessa + area di lavoro della commessa, dove gli ODP si
// assegnano ai carichi con "Sposta in" (POST /api/carichi/sposta). Sostituisce le vecchie viste
// Carichi / ODP per carico / ODP senza carico.
//
// Regole (decise con l'utente 2026-11-15):
// - un ODP sta in un solo carico; le sottoschede seguono il carico del padre finché non vengono
//   assegnate da sole a un carico diverso;
// - gli ODP annullati sono fuori dalla gestione carichi;
// - gli ODP completati devono avere un carico: senza carico sono segnalati in rosso (avviso solo
//   per le commesse non chiuse, lo storico delle chiuse è rumore);
// - i carichi spediti non sono destinazioni di "Sposta in".

export interface OdpInPiuCarichi {
  schedaId: string;
  carichi: { id: string; titolo: string; dataCarico: string | null }[];
}

interface Props {
  carichi: Carico[];
  commesse: Commessa[];
  schede: Scheda[];
  sottoschede: Scheda[];
  doppioni: OdpInPiuCarichi[];
  canWrite: boolean;
  commessaIniziale: string | null;
  cercaIniziale: string;
  daAssegnareIniziale: boolean;
}

const ANNULLATA = "Annullata";
const COMPLETATO = "Completato";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}
const perOdp = (a: Scheda, b: Scheda) =>
  a.odp.localeCompare(b.odp, "it", { numeric: true }) || (a.numeroScheda ?? "").localeCompare(b.numeroScheda ?? "", "it", { numeric: true });
const etichetta = (s: Scheda) => `${s.odp}${s.numeroScheda ? ` - ${s.numeroScheda}` : ""}`;

// Riga mostrata nell'area di lavoro: la scheda e il suo ruolo nella sezione
interface Riga {
  s: Scheda;
  // sottoscheda senza carico proprio: segue il carico del padre
  segue?: boolean;
  // sottoscheda con un carico tutto suo
  sottoDi?: Scheda | null;
  completatoSenzaCarico?: boolean;
}

export default function CarichiCommesse({ carichi, commesse, schede, sottoschede, doppioni, canWrite, commessaIniziale, cercaIniziale, daAssegnareIniziale }: Props) {
  const router = useRouter();
  const [commessaId, setCommessaId] = useState<string | null>(commessaIniziale);
  const [cerca, setCerca] = useState(cercaIniziale);
  const [soloDaAssegnare, setSoloDaAssegnare] = useState(daAssegnareIniziale);
  const [nascondiChiuse, setNascondiChiuse] = useState(true);
  const [vista, setVista] = useState<"tabella" | "galleria">("tabella");
  const [mostraSotto, setMostraSotto] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dest, setDest] = useState("");
  const [lavoro, setLavoro] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [toast, setToast] = useState<{ testo: string; errore?: boolean } | null>(null);
  const [form, setForm] = useState<{ carico: Carico | null; odpIniziali: string[] } | null>(null);
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.errore ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function apriCommessa(id: string | null) {
    setCommessaId(id);
    setSel(new Set());
    setDest("");
    setConfermaElimina(null);
    // Solo l'indirizzo (link condivisibile): i dati sono già tutti qui, niente nuovo giro sul server
    window.history.replaceState(null, "", id ? `/carichi?commessa=${id}` : "/carichi");
    window.scrollTo(0, 0);
  }

  // ---------- indici ----------
  const tutte = useMemo(() => [...schede, ...sottoschede], [schede, sottoschede]);
  const schedaMap = useMemo(() => new Map(tutte.map((s) => [s.id, s])), [tutte]);
  const commessaMap = useMemo(() => new Map(commesse.map((c) => [c.id, c])), [commesse]);

  // Le sottoschede spesso non hanno commessa propria: vale quella del primo antenato che ce l'ha
  const commessaDi = useMemo(() => {
    const cache = new Map<string, string | null>();
    return (s: Scheda): string | null => {
      if (cache.has(s.id)) return cache.get(s.id)!;
      let out: string | null = null;
      for (let cur: Scheda | undefined = s, n = 0; cur && n < 10; cur = cur.parentId ? schedaMap.get(cur.parentId) : undefined, n++) {
        if (cur.commessaId) { out = cur.commessaId; break; }
      }
      cache.set(s.id, out);
      return out;
    };
  }, [schedaMap]);

  const rootDi = useMemo(() => (s: Scheda): Scheda => {
    let cur = s;
    for (let n = 0; cur.parentId && schedaMap.get(cur.parentId) && n < 10; n++) cur = schedaMap.get(cur.parentId)!;
    return cur;
  }, [schedaMap]);

  // Carico proprio di ogni scheda (con doppioni storici vale il primo: l'avviso in panoramica li segnala)
  const caricoDiScheda = useMemo(() => {
    const m = new Map<string, Carico>();
    for (const k of carichi) for (const id of k.odpIds) if (!m.has(id)) m.set(id, k);
    return m;
  }, [carichi]);

  // ---------- riepilogo per commessa (panoramica) ----------
  const riepilogo = useMemo(() => {
    const m = new Map<string, { carichi: Carico[]; nelCarico: number; daAssegnare: number; completatiSenza: number }>();
    const get = (id: string) => {
      let r = m.get(id);
      if (!r) { r = { carichi: [], nelCarico: 0, daAssegnare: 0, completatiSenza: 0 }; m.set(id, r); }
      return r;
    };
    for (const k of carichi) if (k.commessaId) get(k.commessaId).carichi.push(k);
    for (const s of schede) {
      if (s.statoProduzione === ANNULLATA) continue;
      const cid = commessaDi(s);
      if (!cid) continue;
      const r = get(cid);
      if (caricoDiScheda.has(s.id)) r.nelCarico++;
      else if (s.statoProduzione === COMPLETATO) r.completatiSenza++;
      else r.daAssegnare++;
    }
    return m;
  }, [carichi, schede, commessaDi, caricoDiScheda]);

  const commessaChiusa = (c: Commessa | undefined) => c?.stato === "Chiusa";

  const righePanoramica = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return commesse
      .map((c) => ({ c, r: riepilogo.get(c.id) }))
      .filter((x): x is { c: Commessa; r: NonNullable<typeof x.r> } => !!x.r && (x.r.carichi.length > 0 || x.r.daAssegnare > 0 || x.r.completatiSenza > 0))
      .filter(({ c }) => !(nascondiChiuse && commessaChiusa(c)))
      .filter(({ r, c }) => !soloDaAssegnare || r.daAssegnare > 0 || (!commessaChiusa(c) && r.completatiSenza > 0))
      .filter(({ c, r }) => !q || [c.numeroCommessa, c.cliente, c.localita, c.responsabile, ...r.carichi.map((k) => k.titolo)].join(" ").toLowerCase().includes(q))
      .sort((a, b) => b.c.numeroCommessa.localeCompare(a.c.numeroCommessa, "it", { numeric: true }));
  }, [commesse, riepilogo, cerca, nascondiChiuse, soloDaAssegnare]);

  const completatiSenzaAperte = useMemo(
    () => commesse.filter((c) => !commessaChiusa(c) && (riepilogo.get(c.id)?.completatiSenza ?? 0) > 0)
      .map((c) => ({ c, n: riepilogo.get(c.id)!.completatiSenza }))
      .sort((a, b) => b.c.numeroCommessa.localeCompare(a.c.numeroCommessa, "it", { numeric: true })),
    [commesse, riepilogo],
  );
  const totDaAssegnare = useMemo(
    () => commesse.filter((c) => !commessaChiusa(c)).reduce((n, c) => n + (riepilogo.get(c.id)?.daAssegnare ?? 0), 0),
    [commesse, riepilogo],
  );
  const doppioniVisibili = doppioni.filter((d) => schedaMap.has(d.schedaId));

  // ---------- area di lavoro ----------
  const commessa = commessaId ? commessaMap.get(commessaId) ?? null : null;

  const area = useMemo(() => {
    if (!commessa) return null;
    const carichiC = carichi
      .filter((k) => k.commessaId === commessa.id)
      .sort((a, b) => (a.dataCarico ?? "9999").localeCompare(b.dataCarico ?? "9999"));
    const delle = tutte.filter((s) => s.statoProduzione !== ANNULLATA && commessaDi(s) === commessa.id);

    const perCarico = new Map<string, Riga[]>(carichiC.map((k) => [k.id, []]));
    const daAssegnare: Riga[] = [];
    const seguaci = new Map<string, Scheda[]>(); // id ODP → sottoschede che lo seguono

    for (const s of delle) {
      const k = caricoDiScheda.get(s.id);
      const sotto = s.tipologia !== "Scheda";
      if (k && perCarico.has(k.id)) {
        perCarico.get(k.id)!.push({ s, sottoDi: sotto ? rootDi(s) : null });
      } else if (sotto) {
        const root = rootDi(s);
        if (root.id !== s.id && root.statoProduzione !== ANNULLATA) {
          const arr = seguaci.get(root.id) ?? [];
          arr.push(s);
          seguaci.set(root.id, arr);
        } else if (mostraSotto) {
          daAssegnare.push({ s, segue: true });
        }
      } else {
        daAssegnare.push({ s, completatoSenzaCarico: s.statoProduzione === COMPLETATO });
      }
    }

    // Le sottoschede che seguono il padre si mostrano subito sotto il loro ODP (solo con l'interruttore)
    const espandi = (righe: Riga[]): Riga[] => {
      righe.sort((a, b) => perOdp(a.s, b.s));
      if (!mostraSotto) return righe;
      const out: Riga[] = [];
      for (const r of righe) {
        out.push(r);
        for (const f of (seguaci.get(r.s.id) ?? []).sort(perOdp)) out.push({ s: f, segue: true });
      }
      return out;
    };

    // Prima gli aperti, poi i completati senza carico
    const aperti = daAssegnare.filter((r) => !r.completatoSenzaCarico);
    const completati = daAssegnare.filter((r) => r.completatoSenzaCarico);

    return {
      carichi: carichiC,
      perCarico: new Map([...perCarico.entries()].map(([id, righe]) => [id, espandi(righe)])),
      daAssegnare: [...espandi(aperti), ...espandi(completati)],
      nAperti: aperti.filter((r) => r.s.tipologia === "Scheda").length,
      nCompletati: completati.length,
      nAssegnati: [...perCarico.values()].reduce((n, r) => n + r.filter((x) => x.s.tipologia === "Scheda").length, 0),
      nSeguaci: [...seguaci.values()].reduce((n, a) => n + a.length, 0),
    };
  }, [commessa, carichi, tutte, commessaDi, caricoDiScheda, rootDi, mostraSotto]);

  // ---------- azioni ----------
  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleTutti(ids: string[]) {
    setSel((prev) => {
      const next = new Set(prev);
      const tutti = ids.every((id) => next.has(id));
      for (const id of ids) if (tutti) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function sposta() {
    if (!dest) { setToast({ testo: "Scegli prima dove spostare gli ODP selezionati.", errore: true }); return; }
    const ids = [...sel];
    if (dest === "__new") {
      setForm({ carico: null, odpIniziali: ids });
      return;
    }
    setLavoro(true);
    try {
      const res = await fetch("/api/carichi/sposta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ odpIds: ids, caricoId: dest === "__none" ? null : dest }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok) throw new Error(out?.error ?? "Spostamento non riuscito. Riprova.");
      setToast({
        testo: dest === "__none"
          ? `${ids.length} ODP tolti dal carico: la data di produzione prevista resta quella di prima.`
          : `${ids.length} ODP spostati in «${out.carico.titolo}». Produzione prevista degli ODP aperti riallineata (carico del ${fmt(out.carico.dataCarico)} − 5 gg lavorativi).`,
      });
      setSel(new Set());
      setDest("");
      router.refresh();
    } catch (e) {
      setToast({ testo: e instanceof Error ? e.message : "Spostamento non riuscito. Riprova.", errore: true });
    } finally {
      setLavoro(false);
    }
  }

  async function elimina(k: Carico) {
    setLavoro(true);
    try {
      const res = await fetch(`/api/carichi/${k.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Eliminazione non riuscita");
      setToast({ testo: `Carico «${k.titolo}» eliminato: i suoi ODP sono tornati in «Da assegnare».` });
      setSel((prev) => new Set([...prev].filter((id) => !k.odpIds.includes(id))));
      router.refresh();
    } catch (e) {
      setToast({ testo: e instanceof Error ? e.message : "Eliminazione non riuscita", errore: true });
    } finally {
      setLavoro(false);
      setConfermaElimina(null);
    }
  }

  // Il PDF dettagliato scarica da Drive un disegno per ODP: può richiedere alcuni secondi, quindi
  // si apre la scheda subito (gesto utente, niente blocco popup) e la si porta al PDF a fine generazione.
  async function apriPdf(tipo: "riepilogo" | "dettagliato") {
    if (!commessa) return;
    const finestra = window.open("", "_blank");
    setGenerando(true);
    try {
      const res = await fetch(`/api/commesse/${commessa.id}/carichi-pdf?tipo=${tipo}`);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Errore generazione PDF");
      const url = URL.createObjectURL(await res.blob());
      if (finestra) finestra.location.href = url;
      else window.open(url, "_blank");
    } catch (e) {
      finestra?.close();
      setToast({ testo: e instanceof Error ? e.message : "Errore generazione PDF", errore: true });
    } finally {
      setGenerando(false);
    }
  }

  // ---------- render ----------
  const btn = "px-3 py-1.5 rounded-lg text-sm font-semibold border bg-white hover:bg-gray-50 disabled:opacity-50";
  const btnPrimary = "px-3 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50";
  const muted = { color: "var(--color-grey-mid)" };

  const toastEl = toast && (
    <div
      role="status"
      className="fixed top-4 right-4 z-[70] max-w-sm px-4 py-3 rounded-lg text-sm font-medium shadow-lg flex items-start gap-3"
      style={toast.errore ? { background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA" } : { background: "var(--color-black)", color: "white" }}
    >
      <span>{toast.testo}</span>
      <button onClick={() => setToast(null)} className="ml-auto opacity-60 hover:opacity-100 leading-none" aria-label="Chiudi">×</button>
    </div>
  );

  const formEl = form && (
    <FormCarico
      carico={form.carico}
      commesse={commesse.filter((c) => !commessaChiusa(c) || c.id === form.carico?.commessaId || c.id === commessa?.id)}
      commessaFissa={form.carico ? null : commessa?.id ?? null}
      odpIniziali={form.odpIniziali}
      onClose={() => setForm(null)}
      onSave={(saved, avviso) => {
        setForm(null);
        if (form.odpIniziali.length) { setSel(new Set()); setDest(""); }
        setToast({ testo: avviso ?? "Salvato.", errore: avviso?.startsWith("Carico creato, ma") });
        router.refresh();
      }}
    />
  );

  // ===== PANORAMICA =====
  if (!commessa) {
    return (
      <div className="space-y-4">
        {toastEl}
        {formEl}

        {doppioniVisibili.length > 0 && (
          <section className="rounded-lg border p-4 space-y-2" style={{ borderColor: "#FCA5A5", background: "#FEF2F2" }}>
            <h2 className="text-base font-semibold" style={{ color: "#991B1B" }}>ODP in più carichi ({doppioniVisibili.length})</h2>
            <p className="text-sm" style={{ color: "#991B1B" }}>Un ODP deve stare in un solo carico: apri la commessa e usa «Sposta in» sul carico giusto.</p>
            <ul className="text-sm space-y-1">
              {doppioniVisibili.map((d) => {
                const s = schedaMap.get(d.schedaId)!;
                const cid = commessaDi(s);
                return (
                  <li key={d.schedaId}>
                    <button type="button" className="font-semibold hover:underline" onClick={() => cid && apriCommessa(cid)}>{etichetta(s)}</button>
                    <span className="ml-2" style={muted}>{d.carichi.map((c) => `«${c.titolo}»${c.dataCarico ? ` ${fmt(c.dataCarico)}` : ""}`).join(" · ")}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {completatiSenzaAperte.length > 0 && (
          <section className="rounded-lg border p-4 space-y-2" style={{ borderColor: "#FCA5A5", background: "#FEF2F2" }}>
            <h2 className="text-base font-semibold" style={{ color: "#991B1B" }}>
              ODP completati senza carico ({completatiSenzaAperte.reduce((n, x) => n + x.n, 0)})
            </h2>
            <p className="text-sm" style={{ color: "#991B1B" }}>Ogni ODP completato deve stare in un carico. Apri la commessa e assegnali.</p>
            <div className="flex flex-wrap gap-2">
              {completatiSenzaAperte.map(({ c, n }) => (
                <button key={c.id} type="button" onClick={() => apriCommessa(c.id)} className="px-2.5 py-1 rounded text-sm font-semibold bg-white border hover:bg-red-50" style={{ borderColor: "#FCA5A5", color: "#991B1B" }}>
                  {c.numeroCommessa} · {c.cliente} — {n}
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="search"
            id="carichi-cerca"
            aria-label="Cerca commessa o carico"
            className="border rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 w-72 max-w-full"
            placeholder="Cerca commessa, cliente, carico…"
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
          />
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
            <input type="checkbox" checked={soloDaAssegnare} onChange={(e) => setSoloDaAssegnare(e.target.checked)} className="w-4 h-4 cursor-pointer accent-orange-500" />
            Solo commesse con ODP da assegnare
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
            <input type="checkbox" checked={nascondiChiuse} onChange={(e) => setNascondiChiuse(e.target.checked)} className="w-4 h-4 cursor-pointer accent-orange-500" />
            Nascondi commesse chiuse
          </label>
          <span className="text-sm font-medium" style={muted}>{totDaAssegnare} ODP aperti da assegnare nelle commesse aperte</span>
          {canWrite && (
            <button type="button" onClick={() => setForm({ carico: null, odpIniziali: [] })} className={`${btnPrimary} ml-auto`} style={{ background: "var(--color-primary)" }}>
              + Nuovo carico
            </button>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ ...muted, background: "#faf9f7" }}>
                <th className="px-4 py-3">Commessa</th>
                <th className="px-4 py-3">Stato</th>
                <th className="px-4 py-3 text-right">Carichi</th>
                <th className="px-4 py-3">Prossimo carico</th>
                <th className="px-4 py-3 text-right">ODP nei carichi</th>
                <th className="px-4 py-3">Da sistemare</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {righePanoramica.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm" style={muted}>Nessuna commessa trovata</td></tr>
              ) : righePanoramica.map(({ c, r }) => {
                const prossimo = r.carichi.filter((k) => k.stato !== "Spedito").sort((a, b) => (a.dataCarico ?? "9999").localeCompare(b.dataCarico ?? "9999"))[0];
                const spediti = r.carichi.filter((k) => k.stato === "Spedito").length;
                return (
                  <tr
                    key={c.id}
                    tabIndex={0}
                    onClick={() => apriCommessa(c.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") apriCommessa(c.id); }}
                    className="border-b last:border-0 hover:bg-orange-50/30 cursor-pointer transition-colors focus:outline-none focus-visible:bg-orange-50"
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold">{c.numeroCommessa}</span>
                      {c.cliente && <span className="ml-1.5 text-xs" style={muted}>{c.cliente}</span>}
                      {(c.localita || c.responsabile) && <div className="text-xs mt-0.5" style={muted}>{[c.localita, c.responsabile].filter(Boolean).join(" · ")}</div>}
                    </td>
                    <td className="px-4 py-3">{c.stato ? <BadgeStato stato={c.stato} /> : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.carichi.length || "—"}
                      {spediti > 0 && <div className="text-xs" style={muted}>{spediti} spediti</div>}
                    </td>
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                      {prossimo ? <>{fmt(prossimo.dataCarico)} <span className="text-xs" style={muted}>{prossimo.titolo}</span></> : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.nelCarico || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.daAssegnare > 0 && (
                          <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-sm whitespace-nowrap text-white" style={{ background: "var(--color-primary)" }}>
                            {r.daAssegnare} da assegnare
                          </span>
                        )}
                        {r.completatiSenza > 0 && !commessaChiusa(c) && (
                          <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-sm whitespace-nowrap" style={{ background: "#FEE2E2", color: "#991B1B" }}>
                            {r.completatiSenza} completati senza carico
                          </span>
                        )}
                        {r.daAssegnare === 0 && (r.completatiSenza === 0 || commessaChiusa(c)) && <span className="text-xs" style={muted}>tutto assegnato</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap" style={{ color: "var(--color-primary-dark)" }}>Apri →</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ===== AREA DI LAVORO =====
  const a = area!;
  const destinazioni = a.carichi.filter((k) => k.stato !== "Spedito");
  const selezionabili = (righe: Riga[]) => righe.map((r) => r.s.id);

  function renderRighe(righe: Riga[], vuoto: string) {
    if (righe.length === 0) return <p className="py-3 text-sm" style={muted}>{vuoto}</p>;
    if (vista === "galleria") {
      return (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {righe.map((r) => (
            <div
              key={r.s.id}
              className="relative rounded-xl"
              style={sel.has(r.s.id) ? { boxShadow: "0 0 0 3px var(--color-primary)" } : r.completatoSenzaCarico ? { boxShadow: "0 0 0 2px #FCA5A5" } : undefined}
            >
              <SchedaCard s={r.s} sottoscheda={r.s.tipologia !== "Scheda"} onClick={() => router.push(`/schede/${r.s.id}`)} />
              {canWrite && (
                <label className="absolute top-2 right-2 z-20 w-7 h-7 rounded-md bg-white/95 border flex items-center justify-center cursor-pointer shadow-sm" style={{ borderColor: "#d1d5db" }}>
                  <input type="checkbox" aria-label={`Seleziona ${etichetta(r.s)}`} checked={sel.has(r.s.id)} onChange={() => toggle(r.s.id)} className="w-4 h-4 cursor-pointer accent-orange-500" />
                </label>
              )}
              {(r.segue || r.completatoSenzaCarico || r.sottoDi) && (
                <div className="px-1 pt-1 text-[11px] font-semibold" style={{ color: r.completatoSenzaCarico ? "#991B1B" : "var(--color-grey-mid)" }}>
                  {r.completatoSenzaCarico ? "Completato senza carico" : r.segue ? "segue il carico del padre" : `sottoscheda di ${r.sottoDi!.odp}, in carico da sola`}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ ...muted, background: "#faf9f7" }}>
              {canWrite && <th className="px-3 py-3 w-10"><span className="sr-only">Seleziona</span></th>}
              <th className="px-3 py-3 w-20">Copertina</th>
              <th className="px-4 py-3">ODP</th>
              <th className="px-4 py-3">Cliente / Descrizione</th>
              <th className="px-4 py-3">Articolo</th>
              <th className="px-4 py-3 text-right">Q.tà</th>
              <th className="px-4 py-3">Stato</th>
              <th className="px-4 py-3">Fase</th>
              <th className="px-4 py-3">Prod. prevista</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => {
              const s = r.s;
              const selezionata = sel.has(s.id);
              return (
                <tr
                  key={s.id}
                  onClick={() => router.push(`/schede/${s.id}`)}
                  className="border-b last:border-0 hover:bg-orange-50/30 cursor-pointer transition-colors"
                  style={selezionata ? { background: "#FFF3E3" } : r.completatoSenzaCarico ? { background: "#FEF7F7" } : undefined}
                >
                  {canWrite && (
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Seleziona ${etichetta(s)}`} checked={selezionata} onChange={() => toggle(s.id)} className="w-4 h-4 cursor-pointer accent-orange-500" />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    {s.copertina ? (
                      // eslint-disable-next-line @next/next/no-img-element -- vedi SchedaCard
                      <img src={s.copertina} alt="" loading="lazy" className="w-14 h-10 object-cover rounded border" style={{ borderColor: "#e5e4e0" }} />
                    ) : (
                      <div className="w-14 h-10 rounded" style={{ background: coloreDaTesto(s.clienteInfo || s.odp).bg }} />
                    )}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap" style={r.segue || r.sottoDi ? { paddingLeft: 28 } : undefined}>
                    <span className="font-medium">{(r.segue || r.sottoDi) && "↳ "}{etichetta(s)}</span>
                    {r.segue && <div className="text-[11px]" style={muted}>segue il carico del padre</div>}
                    {r.sottoDi && <div className="text-[11px]" style={muted}>sottoscheda di {r.sottoDi.odp}, in carico da sola</div>}
                    {r.completatoSenzaCarico && <div className="text-[11px] font-semibold" style={{ color: "#991B1B" }}>Completato senza carico</div>}
                  </td>
                  <td className="px-4 py-2">{s.clienteInfo || s.descrizioneFasi || "—"}</td>
                  <td className="px-4 py-2">{[s.codiceArticolo, s.posizione].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{s.quantita ?? "—"}</td>
                  <td className="px-4 py-2">{s.statoProduzione ? <BadgeStato stato={s.statoProduzione} /> : "—"}</td>
                  <td className="px-4 py-2">{s.faseCorrente || "—"}</td>
                  <td className="px-4 py-2 tabular-nums whitespace-nowrap">{fmt(s.dataProduzionePrevista)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function selezionaTutti(righe: Riga[]) {
    const ids = selezionabili(righe);
    if (!canWrite || ids.length === 0) return null;
    const tutti = ids.every((id) => sel.has(id));
    return (
      <button type="button" onClick={() => toggleTutti(ids)} className="text-xs font-semibold px-2 py-1 rounded hover:bg-orange-50" style={{ color: "var(--color-primary-dark)" }}>
        {tutti ? "Deseleziona" : "Seleziona tutti"}
      </button>
    );
  }

  const toggleVista = (v: "tabella" | "galleria", label: string) => (
    <button
      type="button"
      onClick={() => setVista(v)}
      className="px-4 rounded-md text-sm font-semibold"
      style={{ height: 32, background: vista === v ? "var(--color-black)" : "transparent", color: vista === v ? "white" : "var(--color-grey-mid)" }}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      {toastEl}
      {formEl}

      <div className="text-sm">
        <button type="button" onClick={() => apriCommessa(null)} className="font-semibold hover:underline" style={{ color: "var(--color-primary-dark)" }}>← Tutte le commesse</button>
      </div>

      <div className="rounded-lg border bg-white px-4 py-3 flex flex-wrap items-center gap-4" style={{ borderColor: "#E4E0DA" }}>
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {commessa.numeroCommessa}{commessa.cliente ? ` · ${commessa.cliente}` : ""}
          </h2>
          <p className="text-sm flex flex-wrap items-center gap-2" style={muted}>
            {[commessa.localita, commessa.responsabile && `resp. ${commessa.responsabile}`].filter(Boolean).join(" · ")}
            {commessa.stato && <BadgeStato stato={commessa.stato} />}
            <Link href={`/commesse/${commessa.id}`} className="font-semibold hover:underline" style={{ color: "var(--color-primary-dark)" }}>Scheda commessa →</Link>
          </p>
        </div>
        <div className="flex gap-6 ml-auto">
          {[
            { n: a.carichi.length, l: "Carichi" },
            { n: a.nAssegnati, l: "ODP assegnati" },
            { n: a.nAperti, l: "Da assegnare", warn: a.nAperti > 0 },
            ...(a.nCompletati > 0 ? [{ n: a.nCompletati, l: "Completati senza carico", err: true }] : []),
          ].map((x) => (
            <div key={x.l} className="flex flex-col">
              <strong className="text-xl tabular-nums" style={{ color: "err" in x && x.err ? "#991B1B" : "warn" in x && x.warn ? "var(--color-primary-dark)" : undefined }}>{x.n}</strong>
              <span className="text-[11px] uppercase tracking-wide" style={muted}>{x.l}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="inline-flex rounded-lg border p-0.5 bg-white" style={{ borderColor: "#d1d5db" }}>
          {toggleVista("tabella", "Tabella")}
          {toggleVista("galleria", "Galleria")}
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
          <input type="checkbox" checked={mostraSotto} onChange={(e) => setMostraSotto(e.target.checked)} className="w-4 h-4 cursor-pointer accent-orange-500" />
          Mostra sottoschede{a.nSeguaci > 0 ? ` (${a.nSeguaci} seguono il padre)` : ""}
        </label>
        <div className="flex flex-wrap gap-2 ml-auto">
          <a href={`/api/commesse/${commessa.id}/carichi-excel`} className={btn} style={{ borderColor: "#d1d5db" }}>Excel</a>
          <button type="button" disabled={generando} onClick={() => apriPdf("riepilogo")} className={btn} style={{ borderColor: "#d1d5db" }}>Stampa riepilogo</button>
          <button type="button" disabled={generando} onClick={() => apriPdf("dettagliato")} className={btn} style={{ borderColor: "#d1d5db" }}>
            {generando ? "Generazione…" : "Stampa dettagliata"}
          </button>
          {canWrite && (
            <button type="button" onClick={() => setForm({ carico: null, odpIniziali: [] })} className={btnPrimary} style={{ background: "var(--color-primary)" }}>
              + Nuovo carico
            </button>
          )}
        </div>
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 pb-2 border-b-2" style={{ borderColor: "var(--color-primary)" }}>
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--color-primary-dark)" }}>Da assegnare</h2>
          <span className="text-sm" style={muted}>
            {a.nAperti} aperti{a.nCompletati > 0 ? ` · ${a.nCompletati} completati senza carico` : ""} — la data di produzione non segue nessun carico
          </span>
          {selezionaTutti(a.daAssegnare)}
        </div>
        {renderRighe(a.daAssegnare, "Tutti gli ODP della commessa sono in un carico.")}
      </section>

      {a.carichi.length === 0 && (
        <p className="py-6 text-center text-sm" style={muted}>Nessun carico per questa commessa: crea il primo con «+ Nuovo carico».</p>
      )}

      {a.carichi.map((k) => {
        const righe = a.perCarico.get(k.id) ?? [];
        const nOdp = righe.filter((r) => !r.segue).length;
        return (
          <section key={k.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 pb-2 border-b" style={{ borderColor: "#E4E0DA" }}>
              <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>{k.titolo || "Senza titolo"}</h2>
              <span className="text-sm tabular-nums" style={muted}>{fmt(k.dataCarico)}</span>
              {k.modalita && <BadgeStato stato={k.modalita} />}
              {k.stato && <BadgeStato stato={k.stato} />}
              <span className="text-sm font-medium" style={muted}>{nOdp} ODP</span>
              {selezionaTutti(righe)}
              {canWrite && (
                <span className="ml-auto inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setForm({ carico: k, odpIniziali: [] })}
                    className="font-semibold px-3 py-1 rounded hover:opacity-80"
                    style={{ color: "var(--color-primary)", background: "rgba(240,143,37,0.08)", fontSize: "0.8rem" }}
                  >
                    Modifica
                  </button>
                  {confermaElimina === k.id ? (
                    <>
                      <button type="button" disabled={lavoro} onClick={() => elimina(k)} className="font-semibold px-3 py-1 rounded text-white disabled:opacity-40" style={{ background: "#DC2626", fontSize: "0.8rem" }}>
                        Conferma eliminazione
                      </button>
                      <button type="button" onClick={() => setConfermaElimina(null)} className="font-semibold px-2 py-1 rounded" style={{ color: "#6B7280", background: "#F3F4F6", fontSize: "0.8rem" }} aria-label="Annulla">✕</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfermaElimina(k.id)} className="font-semibold px-3 py-1 rounded hover:opacity-80" style={{ color: "#DC2626", background: "rgba(220,38,38,0.07)", fontSize: "0.8rem" }}>
                      Elimina
                    </button>
                  )}
                </span>
              )}
            </div>
            {renderRighe(righe, canWrite && k.stato !== "Spedito" ? "Nessun ODP in questo carico: selezionali da «Da assegnare» e usa «Sposta in»." : "Nessun ODP in questo carico.")}
          </section>
        );
      })}

      {sel.size > 0 && <div style={{ height: 72 }} aria-hidden />}

      {canWrite && sel.size > 0 && (
        <div className="fixed left-0 right-0 bottom-0 z-50 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.15)]" style={{ background: "var(--color-black)", color: "white" }}>
          <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-3">
            <strong className="text-sm">{sel.size} selezionati</strong>
            <label htmlFor="carichi-dest" className="text-sm" style={{ color: "#d6d3d1" }}>Sposta in</label>
            <select
              id="carichi-dest"
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              className="rounded px-2 py-1.5 text-sm font-semibold max-w-full"
              style={{ background: "white", color: "var(--color-black)" }}
            >
              <option value="">Scegli destinazione…</option>
              {destinazioni.map((k) => (
                <option key={k.id} value={k.id}>{k.titolo} · {fmt(k.dataCarico)}{k.stato ? ` · ${k.stato}` : ""}</option>
              ))}
              <option value="__none">— Togli dal carico (Da assegnare)</option>
              <option value="__new">+ Nuovo carico con i selezionati…</option>
            </select>
            <button type="button" disabled={lavoro} onClick={sposta} className={btnPrimary} style={{ background: "var(--color-primary)" }}>
              {lavoro ? "Spostamento…" : "Sposta"}
            </button>
            <button type="button" onClick={() => { setSel(new Set()); setDest(""); }} className="ml-auto px-3 py-1.5 rounded-lg text-sm font-semibold border" style={{ borderColor: "#57534e" }}>
              Annulla selezione
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

