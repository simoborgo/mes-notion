"use client";

import { useEffect, useState } from "react";
import { CATEGORIA_ODP_LABEL } from "@/lib/types";

interface Risultato {
  totali: { oreTotali: number; costoTotale: number };
  perCategoria: { categoria: string; ore: number }[];
  perMese: { mese: string; perCategoria: Record<string, number> }[];
  perOperatore: { matricola: string; cognome: string; nome: string; reparto: string | null; ore: number; perCategoria: Record<string, number> }[];
}

const inputCls = "rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";
const card = { borderColor: "#e5e4e0" };
const lbl = (c: string) => CATEGORIA_ODP_LABEL[c] ?? c;
const h = (n: number) => `${Math.round(n * 10) / 10}h`;

function primoDelMese() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function oggi() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function meseLabel(m: string) {
  const [y, mm] = m.split("-").map(Number);
  return new Date(y, mm - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

export default function VistaCausaliStabilimento() {
  const [da, setDa] = useState(primoDelMese);
  const [a, setA] = useState(oggi);
  const [r, setR] = useState<Risultato | null>(null);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let annullato = false;
    setLoading(true);
    setErrore(null);
    const params = new URLSearchParams();
    if (da) params.set("da", da);
    if (a) params.set("a", a);
    fetch(`/api/ore/causali-stabilimento?${params}`)
      .then(async res => {
        const json = await res.json();
        if (annullato) return;
        if (res.ok) setR(json); else setErrore(json.error ?? "Errore");
      })
      .catch(e => { if (!annullato) setErrore((e as Error).message); })
      .finally(() => { if (!annullato) setLoading(false); });
    return () => { annullato = true; };
  }, [da, a]);

  const categorie = r?.perCategoria.map(c => c.categoria) ?? [];
  const maxOre = r?.perCategoria[0]?.ore ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex gap-2 flex-wrap items-center">
        <input type="date" className={inputCls} style={{ height: 48 }} value={da} onChange={e => setDa(e.target.value)} title="Da" />
        <span className="text-sm" style={{ color: "var(--color-grey-mid)" }}>→</span>
        <input type="date" className={inputCls} style={{ height: 48 }} value={a} onChange={e => setA(e.target.value)} title="A" />
      </div>

      {loading && <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</p>}
      {errore && <p className="text-sm" style={{ color: "#991B1B" }}>{errore}</p>}

      {r && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3" style={card}>
              <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-grey-mid)" }}>Ore totali</div>
              <div className="text-2xl font-bold tabular-nums">{h(r.totali.oreTotali)}</div>
            </div>
            <div className="rounded-lg border p-3" style={card}>
              <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-grey-mid)" }}>Costo stimato</div>
              <div className="text-2xl font-bold tabular-nums">€ {r.totali.costoTotale.toLocaleString("it-IT")}</div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-grey-mid)" }}>Per causale</h3>
            {r.perCategoria.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "var(--color-grey-mid)" }}>Nessuna ora nel periodo</p>
            ) : (
              <div className="rounded-lg border overflow-hidden" style={card}>
                {r.perCategoria.map(c => {
                  const pct = r.totali.oreTotali > 0 ? (c.ore / r.totali.oreTotali) * 100 : 0;
                  return (
                    <div key={c.categoria} className="px-4 py-2 text-sm border-b last:border-0" style={{ borderColor: "#f0efec" }}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{lbl(c.categoria)}<span className="ml-2 text-xs font-normal" style={{ color: "var(--color-grey-mid)" }}>{pct.toFixed(0)}%</span></span>
                        <span className="font-semibold tabular-nums">{h(c.ore)}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full" style={{ background: "#F5F2EE" }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${maxOre > 0 ? (c.ore / maxOre) * 100 : 0}%`, background: "var(--color-primary)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {r.perMese.length > 1 && (
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-grey-mid)" }}>Per mese</h3>
              <div className="rounded-lg border overflow-x-auto" style={card}>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-bold uppercase" style={{ background: "#faf9f7", color: "var(--color-grey-mid)" }}>
                      <th className="px-4 py-2">Mese</th>
                      {categorie.map(c => <th key={c} className="px-4 py-2 text-right">{lbl(c)}</th>)}
                      <th className="px-4 py-2 text-right">Totale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.perMese.map(m => (
                      <tr key={m.mese} className="border-t" style={{ borderColor: "#f0efec" }}>
                        <td className="px-4 py-2 capitalize">{meseLabel(m.mese)}</td>
                        {categorie.map(c => <td key={c} className="px-4 py-2 text-right tabular-nums">{m.perCategoria[c] ? h(m.perCategoria[c]) : "—"}</td>)}
                        <td className="px-4 py-2 text-right font-semibold tabular-nums">{h(Object.values(m.perCategoria).reduce((s, x) => s + x, 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-grey-mid)" }}>Per operatore</h3>
            <div className="rounded-lg border overflow-x-auto" style={card}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold uppercase" style={{ background: "#faf9f7", color: "var(--color-grey-mid)" }}>
                    <th className="px-4 py-2">Operatore</th>
                    <th className="px-4 py-2">Reparto</th>
                    {categorie.map(c => <th key={c} className="px-4 py-2 text-right">{lbl(c)}</th>)}
                    <th className="px-4 py-2 text-right">Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {r.perOperatore.length === 0 ? (
                    <tr><td colSpan={categorie.length + 3} className="px-4 py-6 text-center" style={{ color: "var(--color-grey-mid)" }}>Nessuna registrazione nel periodo</td></tr>
                  ) : r.perOperatore.map(o => (
                    <tr key={o.matricola} className="border-t" style={{ borderColor: "#f0efec" }}>
                      <td className="px-4 py-2 font-semibold whitespace-nowrap">{o.cognome} {o.nome}</td>
                      <td className="px-4 py-2" style={{ color: "var(--color-grey-mid)" }}>{o.reparto ?? "—"}</td>
                      {categorie.map(c => <td key={c} className="px-4 py-2 text-right tabular-nums">{o.perCategoria[c] ? h(o.perCategoria[c]) : "—"}</td>)}
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">{h(o.ore)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
