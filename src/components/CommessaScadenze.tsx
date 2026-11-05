"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CommessaScadenza } from "@/lib/types";

const inputCls = "border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";
type Filtro = "aperte" | "fatte" | "tutte";

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

export default function CommessaScadenze({ commessaId, scadenze, odp, oggi, canEdit }: {
  commessaId: string; scadenze: CommessaScadenza[]; odp: { id: string; odp: string }[]; oggi: string; canEdit: boolean;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("aperte");
  const [titolo, setTitolo] = useState("");
  const [data, setData] = useState("");
  const [schedaId, setSchedaId] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");

  const visibili = useMemo(
    () => scadenze.filter((s) => filtro === "tutte" || (filtro === "aperte" ? s.stato === "aperta" : s.stato === "fatta")),
    [scadenze, filtro],
  );

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

  async function cambiaStato(s: CommessaScadenza) {
    const res = await fetch(`/api/commesse/${commessaId}/scadenze/${s.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato: s.stato === "aperta" ? "fatta" : "aperta" }),
    });
    if (res.ok) router.refresh(); else setErrore("Errore nell'aggiornamento");
  }

  async function elimina(s: CommessaScadenza) {
    if (!window.confirm(`Eliminare "${s.titolo}"?`)) return;
    const res = await fetch(`/api/commesse/${commessaId}/scadenze/${s.id}`, { method: "DELETE" });
    if (res.ok) router.refresh(); else setErrore("Errore nell'eliminazione");
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
          {errore && <p className="text-xs" style={{ color: "#991B1B" }}>{errore}</p>}
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap">
        {(["aperte", "fatte", "tutte"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className="text-xs rounded-full border px-3 py-1 capitalize"
            style={filtro === f ? { background: "var(--color-black)", color: "#fff", borderColor: "var(--color-black)" } : { background: "#fff", color: "var(--color-grey-mid)", borderColor: "#E4E0DA" }}
          >
            {f}
          </button>
        ))}
      </div>

      {visibili.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm" style={{ color: "var(--color-grey-mid)" }}>
          {scadenze.length === 0 ? "Nessuna scadenza. Aggiungine una qui, oppure scrivi al bot Telegram con «entro gg/mm»." : "Nessuna scadenza in questo elenco."}
        </div>
      ) : (
        <ul className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
          {visibili.map((s) => {
            const a = aspetto(s, oggi);
            return (
              <li key={s.id} id={`riga-sc-${s.id}`} className="flex items-start gap-3 p-4">
                {canEdit ? (
                  <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={s.stato === "fatta"} onChange={() => cambiaStato(s)} aria-label={s.stato === "fatta" ? "Riapri" : "Segna come fatta"} />
                ) : null}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={s.stato === "fatta" ? { textDecoration: "line-through", color: "var(--color-grey-mid)" } : undefined}>{s.titolo}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-grey-mid)" }}>
                    {[`Entro ${fmt(s.scadenza)}`, s.odp && `ODP ${s.odp}`, s.fonte === "telegram" && "da Telegram", s.creatoDa].filter(Boolean).join(" · ")}
                  </p>
                  {canEdit && <button type="button" className="text-xs underline mt-1" style={{ color: "#991B1B" }} onClick={() => elimina(s)}>Elimina</button>}
                </div>
                <span className="text-xs font-semibold rounded-full px-2 py-0.5 whitespace-nowrap" style={{ background: a.sfondo, color: a.colore }}>{a.testo}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
