"use client";

import { useMemo, useState } from "react";
import { diffGiorni, type ArrivoCommessa, type Granularita } from "@/lib/arrivoDisegniCalc";
import { costruisciVista, type DatiCommessaArrivo } from "@/lib/arrivoDisegniVista";
import GraficoArrivoDisegni from "./GraficoArrivoDisegni";

const BORDO = "#E4E0DA";

function fmt(d: string | null): string {
  if (!d) return "—";
  const [y, m, g] = d.split("-");
  return `${g}/${m}/${y}`;
}

function Kpi({ etichetta, valore, dettaglio }: { etichetta: string; valore: string; dettaglio: string }) {
  return (
    <div className="rounded-xl p-5 min-w-0 bg-white" style={{ border: `1px solid ${BORDO}` }}>
      <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#9c9894" }}>{etichetta}</div>
      <div className="text-3xl font-semibold tabular-nums mt-1" style={{ fontFamily: "var(--font-display)" }}>{valore}</div>
      <div className="text-xs mt-1.5" style={{ color: "var(--color-grey-mid)" }}>{dettaglio}</div>
    </div>
  );
}

export default function DashboardArrivoDisegni({
  commessa, arrivo, oggi,
}: { commessa: DatiCommessaArrivo; arrivo: ArrivoCommessa; oggi: string }) {
  const [gran, setGran] = useState<Granularita | null>(null);
  const [sel, setSel] = useState<number | null>(null);

  const vista = useMemo(() => costruisciVista(commessa, arrivo, oggi, gran ?? undefined), [commessa, arrivo, oggi, gran]);

  if (!vista) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center text-sm" style={{ borderColor: BORDO, color: "var(--color-grey-mid)" }}>
        Nessun disegno con data di arrivo per questa commessa
        {arrivo.senzaData > 0 && ` (${arrivo.senzaData} schede senza data di scheda ricevuta)`}.
      </div>
    );
  }

  const { buckets, granularita, riepilogo: r, fine, fineDaCarico } = vista;
  const bucket = sel != null ? buckets[sel] : null;

  // Avanzamento nel tempo della finestra di produzione (inizio inserito → fine/carico)
  let tempoTrascorso: { pct: number; giorno: number; durata: number } | null = null;
  if (commessa.inizioProduzione && fine && fine > commessa.inizioProduzione) {
    const durata = diffGiorni(commessa.inizioProduzione, fine);
    const giorno = Math.max(0, diffGiorni(commessa.inizioProduzione, oggi));
    tempoTrascorso = { pct: Math.min(100, Math.round((giorno / durata) * 100)), giorno, durata };
  }
  const pctCompletate = arrivo.totale ? Math.round((arrivo.completate / arrivo.totale) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi etichetta="Disegni arrivati" valore={String(r.conData)}
          dettaglio={arrivo.senzaData > 0 ? `+ ${arrivo.senzaData} senza data di arrivo` : "tutti con data di arrivo"} />
        <Kpi etichetta="Finestra trascorsa" valore={tempoTrascorso ? `${tempoTrascorso.pct}%` : "—"}
          dettaglio={tempoTrascorso ? `giorno ${tempoTrascorso.giorno} di ${tempoTrascorso.durata}` : "serve inizio produzione e fine/carico"} />
        <Kpi etichetta="Concentrazione"
          valore={r.giorni50 != null ? `${r.giorni50} gg` : "—"}
          dettaglio={r.giorni80 != null ? `per il 50% dei disegni · ${r.giorni80} gg per l'80%` : "giorni dall'inizio"} />
        <Kpi etichetta="Settimana di picco" valore={r.picco ? String(r.picco.n) : "—"}
          dettaglio={r.picco ? `disegni, sett. dal ${fmt(r.picco.da)}` : ""} />
      </div>

      <div className="rounded-xl border bg-white p-5" style={{ borderColor: BORDO }}>
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>Arrivo disegni nel tempo</h2>
          <span className="text-xs" style={{ color: "var(--color-grey-mid)" }}>
            {fmt(r.primoArrivo)} → {fmt(r.ultimoArrivo)} · completati {arrivo.completate}/{arrivo.totale} ({pctCompletate}%)
          </span>
          <div className="flex items-center gap-1.5 ml-auto">
            {(["giorno", "settimana"] as const).map(g => {
              const active = granularita === g;
              return (
                <button key={g} onClick={() => { setGran(g); setSel(null); }}
                  className="text-xs px-2.5 py-1 rounded-full font-medium border transition-colors"
                  style={active
                    ? { background: "rgba(240,143,37,0.12)", color: "var(--color-primary)", borderColor: "rgba(240,143,37,0.35)" }
                    : { background: "white", color: "var(--color-grey-mid)", borderColor: "#d1d5db" }}>
                  {g === "giorno" ? "Per giorno" : "Per settimana"}
                </button>
              );
            })}
          </div>
        </div>

        <GraficoArrivoDisegni
          buckets={buckets} granularita={granularita} selezionato={sel} onSelect={setSel}
          marcatori={{ inizio: commessa.inizioProduzione, fine, oggi }}
        />

        <div className="flex gap-4 flex-wrap mt-3 text-[11px]" style={{ color: "#6b7280" }}>
          <span><span style={{ color: "#0D9488" }}>■</span> Disegni arrivati (scala a sinistra)</span>
          {r.prima > 0 && <span><span style={{ color: "#C9C5BF" }}>■</span> Prima dell&apos;inizio produzione ({r.prima})</span>}
          <span><span style={{ color: "#1a1714" }}>━</span> Cumulato % (scala a destra)</span>
          {commessa.inizioProduzione && <span><span style={{ color: "#0D9488" }}>┃</span> Inizio produzione</span>}
          {fine && <span><span style={{ color: "#0D9488" }}>┆</span> {fineDaCarico ? "Carico (fine produzione non inserita)" : "Fine produzione"}</span>}
          <span><span style={{ color: "#ef4444" }}>┃</span> Oggi</span>
        </div>
        <p className="text-[11px] mt-2" style={{ color: "var(--color-grey-mid)" }}>
          Il cumulato è sul totale dei disegni arrivati finora: il numero finale non è noto in anticipo.
          Il giorno di arrivo è la data scheda ricevuta (di norma quella di import del PDF).
        </p>
      </div>

      {bucket && (
        <div className="rounded-xl border bg-white p-5" style={{ borderColor: BORDO }}>
          <div className="text-sm font-semibold mb-2">
            {granularita === "settimana" ? `Settimana ${fmt(bucket.da)} → ${fmt(bucket.a)}` : fmt(bucket.da)}
            <span className="font-normal" style={{ color: "var(--color-grey-mid)" }}> · {bucket.n} disegni · {bucket.odp.length} ODP</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {bucket.odp.map(o => (
              <span key={o} className="text-xs px-2 py-0.5 rounded tabular-nums" style={{ background: "#faf9f7", border: `1px solid ${BORDO}` }}>{o}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
