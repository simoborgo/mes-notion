"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CommessaScadenza } from "@/lib/types";

const inputCls = "border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";
type Colonna = "scadute" | "settimana" | "avanti" | "fatte";
const COLONNE: { key: Colonna; titolo: string; vuota: string }[] = [
  { key: "scadute", titolo: "Scadute", vuota: "Nessuna scadenza in ritardo" },
  { key: "settimana", titolo: "Entro 7 giorni", vuota: "Niente in arrivo" },
  { key: "avanti", titolo: "Più avanti", vuota: "Niente di pianificato" },
  { key: "fatte", titolo: "Fatte", vuota: "Trascina qui per chiudere" },
];

function giorni(da: string, a: string): number {
  return Math.round((Date.parse(a) - Date.parse(da)) / 86400000);
}
function fmt(d: string): string {
  const [y, m, g] = d.split("-");
  return `${g}/${m}/${y}`;
}

// Stato visivo di una scadenza aperta rispetto a oggi (data già in fuso Roma, passata dal server).
function aspetto(s: CommessaScadenza, oggi: string): { testo: string; colore: string; sfondo: string } {
  if (s.stato === "fatta") return { testo: s.fattaIl ? `Chiusa il ${fmt(s.fattaIl.slice(0, 10))}` : "Chiusa", colore: "var(--color-grey-mid)", sfondo: "#EFEBE5" };
  const d = giorni(oggi, s.scadenza);
  if (d < 0) return { testo: d === -1 ? "Scaduta ieri" : `Scaduta da ${-d} giorni`, colore: "#991B1B", sfondo: "#FEE2E2" };
  if (d === 0) return { testo: "Scade oggi", colore: "#C06A10", sfondo: "#FDEBD6" };
  if (d <= 7) return { testo: d === 1 ? "Domani" : `Tra ${d} giorni`, colore: "#C06A10", sfondo: "#FDEBD6" };
  return { testo: `Tra ${d} giorni`, colore: "var(--color-grey-mid)", sfondo: "#EFEBE5" };
}

function colonnaDi(s: CommessaScadenza, oggi: string): Colonna {
  if (s.stato === "fatta") return "fatte";
  const d = giorni(oggi, s.scadenza);
  return d < 0 ? "scadute" : d <= 7 ? "settimana" : "avanti";
}

export default function CommessaScadenze({ commessaId, scadenze, odp, oggi, canEdit }: {
  commessaId: string; scadenze: CommessaScadenza[]; odp: { id: string; odp: string }[]; oggi: string; canEdit: boolean;
}) {
  const router = useRouter();
  const [titolo, setTitolo] = useState("");
  const [data, setData] = useState("");
  const [schedaId, setSchedaId] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [trascinata, setTrascinata] = useState<string | null>(null);
  const [sopra, setSopra] = useState<Colonna | null>(null);

  const colonne = useMemo(() => {
    const m: Record<Colonna, CommessaScadenza[]> = { scadute: [], settimana: [], avanti: [], fatte: [] };
    for (const s of scadenze) m[colonnaDi(s, oggi)].push(s);
    for (const k of ["scadute", "settimana", "avanti"] as const) m[k].sort((a, b) => a.scadenza.localeCompare(b.scadenza));
    m.fatte.sort((a, b) => (b.fattaIl ?? "").localeCompare(a.fattaIl ?? ""));
    return m;
  }, [scadenze, oggi]);

  async function aggiungi() {
    if (!titolo.trim()) { setErrore("Scrivi cosa deve essere fatto"); return; }
    if (!data) { setErrore("Scegli la data di scadenza"); return; }
    setBusy(true); setErrore("");
    try {
      const res = await fetch(`/api/commesse/${commessaId}/scadenze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titolo, scadenza: data, schedaId: schedaId || null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Errore nel salvataggio");
      setTitolo(""); setData(""); setSchedaId("");
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore nel salvataggio");
    } finally {
      setBusy(false);
    }
  }

  async function patch(s: CommessaScadenza, body: Record<string, unknown>) {
    const res = await fetch(`/api/commesse/${commessaId}/scadenze/${s.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.ok) { setErrore(""); router.refresh(); } else setErrore((await res.json().catch(() => ({}))).error ?? "Errore nell'aggiornamento");
  }

  async function elimina(s: CommessaScadenza) {
    if (!window.confirm(`Eliminare "${s.titolo}"?`)) return;
    const res = await fetch(`/api/commesse/${commessaId}/scadenze/${s.id}`, { method: "DELETE" });
    if (res.ok) router.refresh(); else setErrore("Errore nell'eliminazione");
  }

  // Trascinando: in «Fatte» chiude, fuori da «Fatte» riapre. Le altre colonne sono calcolate dalla data.
  function rilascia(col: Colonna) {
    const s = scadenze.find((x) => x.id === trascinata);
    setTrascinata(null); setSopra(null);
    if (!s || !canEdit) return;
    const da = colonnaDi(s, oggi);
    if (col === "fatte" && da !== "fatte") patch(s, { stato: "fatta" });
    else if (col !== "fatte" && da === "fatte") patch(s, { stato: "aperta" });
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
          <div className="flex gap-2 flex-wrap items-center">
            <input className={`${inputCls} flex-1 min-w-[220px]`} value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Cosa va fatto. Es. Conferma finitura al cliente" aria-label="Scadenza" />
            <input type="date" className={inputCls} value={data} onChange={(e) => setData(e.target.value)} aria-label="Data di scadenza" />
            <select className={inputCls} value={schedaId} onChange={(e) => setSchedaId(e.target.value)} aria-label="ODP collegato">
              <option value="">Tutta la commessa</option>
              {odp.map((o) => <option key={o.id} value={o.id}>ODP {o.odp}</option>)}
            </select>
            <button type="button" onClick={aggiungi} disabled={busy} className="text-sm font-semibold rounded px-3 py-1.5 disabled:opacity-50" style={{ background: "var(--color-primary)", color: "var(--color-black)" }}>
              {busy ? "Salvo…" : "Aggiungi"}
            </button>
          </div>
        </div>
      )}
      {errore && <p className="text-xs" style={{ color: "#991B1B" }}>{errore}</p>}

      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4 items-start">
        {COLONNE.map((c) => {
          const items = colonne[c.key];
          const attiva = sopra === c.key && canEdit;
          return (
            <section
              key={c.key}
              aria-label={c.titolo}
              onDragOver={(e) => { if (trascinata && canEdit) { e.preventDefault(); setSopra(c.key); } }}
              onDragLeave={() => setSopra((v) => (v === c.key ? null : v))}
              onDrop={(e) => { e.preventDefault(); rilascia(c.key); }}
              className="rounded-lg border p-2 space-y-2 min-h-[120px]"
              style={{ background: attiva ? "#FDEBD6" : "#F8F7F5", borderColor: attiva ? "var(--color-primary)" : "#E4E0DA" }}
            >
              <h3 className="px-1 flex items-center justify-between text-xs font-bold uppercase tracking-widest" style={{ color: c.key === "scadute" && items.length ? "#991B1B" : "#9c9894" }}>
                {c.titolo}
                <span className="rounded-full px-1.5 text-[11px]" style={{ background: "#EFEBE5", color: "var(--color-grey-mid)" }}>{items.length}</span>
              </h3>
              {items.length === 0 && <p className="px-1 py-3 text-xs" style={{ color: "var(--color-grey-mid)" }}>{c.vuota}</p>}
              {items.map((s) => {
                const a = aspetto(s, oggi);
                return (
                  <article
                    key={s.id}
                    id={`riga-sc-${s.id}`}
                    draggable={canEdit}
                    onDragStart={(e) => { setTrascinata(s.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", s.id); }}
                    onDragEnd={() => { setTrascinata(null); setSopra(null); }}
                    className="rounded-md border bg-white p-3 space-y-1.5"
                    style={{ borderColor: "#E4E0DA", cursor: canEdit ? "grab" : undefined, opacity: trascinata === s.id ? 0.5 : 1 }}
                  >
                    <div className="flex items-start gap-2">
                      {canEdit && (
                        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={s.stato === "fatta"} onChange={() => patch(s, { stato: s.stato === "aperta" ? "fatta" : "aperta" })} aria-label={s.stato === "fatta" ? "Riapri" : "Segna come fatta"} />
                      )}
                      <p className="text-sm font-medium flex-1 min-w-0" style={s.stato === "fatta" ? { textDecoration: "line-through", color: "var(--color-grey-mid)" } : undefined}>{s.titolo}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs" style={{ color: "var(--color-grey-mid)" }}>
                      <span className="font-semibold rounded-full px-2 py-0.5 whitespace-nowrap" style={{ background: a.sfondo, color: a.colore }}>{a.testo}</span>
                      {canEdit && s.stato === "aperta" ? (
                        <input type="date" value={s.scadenza} onChange={(e) => e.target.value && patch(s, { scadenza: e.target.value })} aria-label="Cambia data di scadenza" className="border rounded px-1 py-0.5 text-xs bg-white" />
                      ) : (
                        <span>Entro {fmt(s.scadenza)}</span>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
                      {[s.odp && `ODP ${s.odp}`, s.fonte === "telegram" && "da Telegram", s.creatoDa].filter(Boolean).join(" · ")}
                    </p>
                    {canEdit && <button type="button" className="text-xs underline" style={{ color: "#991B1B" }} onClick={() => elimina(s)}>Elimina</button>}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
