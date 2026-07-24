"use client";

import { useEffect, useState } from "react";

interface KpiTotali {
  oreTotali: number; oreValore: number; oreRifacimento: number;
  percRifacimento: number; costoTotale: number; costoRifacimento: number;
}
interface KpiPerOdp { odp: string; oreTotali: number; oreRifacimento: number; percRifacimento: number; costo: number; }
interface KpiPerOperatore { matricola: string; cognome: string; nome: string; oreTotali: number; giorniLavorati: number; }
interface KpiPerCausale { causale: string; ore: number; perc: number; costo: number; }
interface KpiPerReparto { reparto: string; oreTotali: number; oreRifacimento: number; percRifacimento: number; }
interface Top5 { odp: string; oreRifacimento: number; }

interface KpiResponse {
  totali: KpiTotali;
  perOdp: KpiPerOdp[];
  perOperatore: KpiPerOperatore[];
  perCausale: KpiPerCausale[];
  perReparto: KpiPerReparto[];
  top5Rifacimento: Top5[];
}

const inputCls = "rounded-lg border px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

function primoGiornoMese(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
}
function oggiStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function KpiCard({ label, value, accent, bg, sublabel }: { label: string; value: string; accent: string; bg: string; sublabel?: string }) {
  return (
    <div className="rounded-lg px-4 py-3 flex items-center gap-3 border" style={{ background: bg, borderColor: accent + "33" }}>
      <span className="text-2xl font-bold tabular-nums leading-none shrink-0" style={{ color: accent, fontFamily: "ui-monospace, 'SF Mono', monospace", letterSpacing: "-0.02em" }}>{value}</span>
      <div>
        <div className="text-xs font-medium" style={{ color: "var(--color-grey-mid)" }}>{label}</div>
        {sublabel && <div className="text-xs mt-0.5" style={{ color: accent }}>{sublabel}</div>}
      </div>
    </div>
  );
}

function semaforo(perc: number): { bg: string; text: string; label: string } {
  if (perc < 5) return { bg: "#D1FAE5", text: "#065F46", label: "●" };
  if (perc <= 10) return { bg: "#FEF3C7", text: "#92400E", label: "●" };
  return { bg: "#FEE2E2", text: "#991B1B", label: "●" };
}

export default function VistaKpi() {
  const [da, setDa] = useState(primoGiornoMese());
  const [a, setA] = useState(oggiStr());
  const [kpi, setKpi] = useState<KpiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErrore(null);
    fetch(`/api/ore/kpi?da=${da}&a=${a}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setKpi(json);
      })
      .catch(e => setErrore(e.message))
      .finally(() => setLoading(false));
  }, [da, a]);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 items-center flex-wrap">
        <label className="text-sm font-semibold" style={{ color: "var(--color-grey-mid)" }}>Periodo</label>
        <input type="date" className={inputCls} style={{ height: 44 }} value={da} onChange={e => setDa(e.target.value)} />
        <span className="text-sm" style={{ color: "var(--color-grey-mid)" }}>→</span>
        <input type="date" className={inputCls} style={{ height: 44 }} value={a} onChange={e => setA(e.target.value)} />
      </div>

      {errore && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}>
          {errore}
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--color-grey-mid)" }}>Caricamento…</p>
      ) : kpi && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KpiCard label="Ore totali" value={`${kpi.totali.oreTotali}h`} accent="#1D4ED8" bg="#EFF6FF" />
            <KpiCard label="Ore a valore" value={`${kpi.totali.oreValore}h`} accent="#065F46" bg="#ECFDF5" />
            <KpiCard label="Ore rifacimento" value={`${kpi.totali.oreRifacimento}h`} accent="#991B1B" bg="#FEF2F2" sublabel={`${kpi.totali.percRifacimento.toFixed(1)}% del totale`} />
            <KpiCard label="Costo ore totali" value={`€${kpi.totali.costoTotale.toFixed(0)}`} accent="var(--color-primary)" bg="rgba(240,143,37,0.08)" />
            <KpiCard label="Costo rifacimenti" value={`€${kpi.totali.costoRifacimento.toFixed(0)}`} accent="#991B1B" bg="#FEF2F2" />
          </div>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-grey-mid)" }}>Per reparto — % rifacimento</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {kpi.perReparto.map(r => {
                const s = semaforo(r.percRifacimento);
                return (
                  <div key={r.reparto} className="rounded-lg border px-3 py-2 flex items-center justify-between" style={{ borderColor: "#e5e4e0" }}>
                    <div>
                      <div className="text-sm font-semibold">{r.reparto}</div>
                      <div className="text-xs" style={{ color: "var(--color-grey-mid)" }}>{r.oreTotali}h totali</div>
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: s.bg, color: s.text }}>
                      {r.percRifacimento.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-grey-mid)" }}>Top 5 ODP per ore rifacimento</h3>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: "#e5e4e0" }}>
              {kpi.top5Rifacimento.length === 0 ? (
                <p className="px-4 py-3 text-sm" style={{ color: "var(--color-grey-mid)" }}>Nessun rifacimento nel periodo</p>
              ) : kpi.top5Rifacimento.map((t, i) => (
                <div key={t.odp} className="flex justify-between px-4 py-2 text-sm border-b last:border-0" style={{ borderColor: "#f0efec" }}>
                  <span><span className="font-mono text-xs mr-2" style={{ color: "var(--color-grey-icon)" }}>#{i + 1}</span>{t.odp}</span>
                  <span className="font-semibold tabular-nums" style={{ color: "#991B1B" }}>{t.oreRifacimento}h</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-grey-mid)" }}>Per ODP</h3>
            <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold uppercase" style={{ background: "#faf9f7", color: "var(--color-grey-mid)" }}>
                    <th className="px-4 py-2">ODP</th>
                    <th className="px-4 py-2">Ore tot.</th>
                    <th className="px-4 py-2">Ore rifac.</th>
                    <th className="px-4 py-2">% rifac.</th>
                    <th className="px-4 py-2">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {kpi.perOdp.map(o => (
                    <tr key={o.odp} className="border-t hover:bg-orange-50/30" style={{ borderColor: "#f0efec" }}>
                      <td className="px-4 py-2 font-semibold">{o.odp}</td>
                      <td className="px-4 py-2 tabular-nums">{o.oreTotali}h</td>
                      <td className="px-4 py-2 tabular-nums" style={{ color: o.oreRifacimento > 0 ? "#991B1B" : undefined }}>{o.oreRifacimento}h</td>
                      <td className="px-4 py-2 tabular-nums">{o.percRifacimento.toFixed(1)}%</td>
                      <td className="px-4 py-2 tabular-nums">€{o.costo.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-grey-mid)" }}>Per operatore</h3>
            <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold uppercase" style={{ background: "#faf9f7", color: "var(--color-grey-mid)" }}>
                    <th className="px-4 py-2">Operatore</th>
                    <th className="px-4 py-2">Ore totali</th>
                    <th className="px-4 py-2">Giorni lavorati</th>
                  </tr>
                </thead>
                <tbody>
                  {kpi.perOperatore.map(o => (
                    <tr key={o.matricola} className="border-t hover:bg-orange-50/30" style={{ borderColor: "#f0efec" }}>
                      <td className="px-4 py-2">{o.cognome} {o.nome}</td>
                      <td className="px-4 py-2 tabular-nums font-semibold">{o.oreTotali}h</td>
                      <td className="px-4 py-2 tabular-nums">{o.giorniLavorati}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-grey-mid)" }}>Per causale rifacimento</h3>
            <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "#e5e4e0" }}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold uppercase" style={{ background: "#faf9f7", color: "var(--color-grey-mid)" }}>
                    <th className="px-4 py-2">Causale</th>
                    <th className="px-4 py-2">Ore</th>
                    <th className="px-4 py-2">%</th>
                    <th className="px-4 py-2">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {kpi.perCausale.map(c => (
                    <tr key={c.causale} className="border-t hover:bg-orange-50/30" style={{ borderColor: "#f0efec" }}>
                      <td className="px-4 py-2 font-semibold">{c.causale}</td>
                      <td className="px-4 py-2 tabular-nums">{c.ore}h</td>
                      <td className="px-4 py-2 tabular-nums">{c.perc.toFixed(1)}%</td>
                      <td className="px-4 py-2 tabular-nums">€{c.costo.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
