"use client";

import { diffGiorni, type Bucket, type Granularita } from "@/lib/arrivoDisegniCalc";

const TEAL = "#0D9488";
const GRIGIO = "#C9C5BF";
const ARANCIO = "#F08F25";
const ROSSO = "#ef4444";

export interface Marcatori { inizio: string | null; fine: string | null; oggi: string | null; }

// Barre = disegni arrivati per giorno/settimana (scala di sinistra); linea = cumulato in % dei
// disegni arrivati finora (scala di destra, 0-100%). Le barre arrivate prima dell'inizio produzione
// inserito sono grigie. In versione compatta (panoramica) niente assi né interazione.
export default function GraficoArrivoDisegni({
  buckets, granularita, marcatori, compatto = false, selezionato = null, onSelect,
}: {
  buckets: Bucket[];
  granularita: Granularita;
  marcatori: Marcatori;
  compatto?: boolean;
  selezionato?: number | null;
  onSelect?: (i: number | null) => void;
}) {
  if (buckets.length === 0) return null;
  const W = compatto ? 320 : 960;
  const H = compatto ? 110 : 280;
  const padL = compatto ? 4 : 34, padR = compatto ? 4 : 40, padT = compatto ? 6 : 14, padB = compatto ? 6 : 26;
  const iw = W - padL - padR, ih = H - padT - padB;
  const n = buckets.length;
  const bw = iw / n;
  const passo = granularita === "settimana" ? 7 : 1;
  const start = buckets[0].da;
  const tot = buckets[n - 1].cumulato || 1;
  const maxN = Math.max(1, ...buckets.map(b => b.n));
  const yN = (v: number) => padT + ih - (v / maxN) * ih;
  const yP = (cum: number) => padT + ih - (cum / tot) * ih;
  const xData = (d: string) => padL + (diffGiorni(start, d) / (passo * n)) * iw;

  const linea = buckets.map((b, i) => `${padL + (i + 0.5) * bw},${yP(b.cumulato)}`).join(" ");

  // Etichette mese sull'asse X (solo versione estesa)
  const mesi: { x: number; label: string }[] = [];
  if (!compatto) {
    let ultimo = "";
    buckets.forEach((b, i) => {
      const m = b.da.slice(0, 7);
      if (m !== ultimo) {
        ultimo = m;
        const d = new Date(`${b.da}T00:00:00Z`);
        mesi.push({ x: padL + i * bw, label: d.toLocaleDateString("it-IT", { month: "short", year: "2-digit", timeZone: "UTC" }) });
      }
    });
  }

  function marker(data: string | null, colore: string, tratteggio: boolean, key: string) {
    if (!data || data < start || diffGiorni(start, data) > passo * n) return null;
    const x = xData(data);
    return <line key={key} x1={x} x2={x} y1={padT} y2={padT + ih} stroke={colore} strokeWidth={compatto ? 1.5 : 2} strokeDasharray={tratteggio ? "5 4" : undefined} opacity={0.85} />;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label="Arrivo dei disegni nel tempo">
      {!compatto && [0, 0.25, 0.5, 0.75, 1].map(q => (
        <g key={q}>
          <line x1={padL} x2={padL + iw} y1={padT + ih - q * ih} y2={padT + ih - q * ih} stroke="#eee9e3" />
          <text x={padL + iw + 6} y={padT + ih - q * ih + 3} fontSize={10} fill="#9c9894">{Math.round(q * 100)}%</text>
          <text x={padL - 6} y={padT + ih - q * ih + 3} fontSize={10} fill="#9c9894" textAnchor="end">{Math.round(q * maxN)}</text>
        </g>
      ))}
      {compatto && <line x1={padL} x2={padL + iw} y1={padT + ih} y2={padT + ih} stroke="#eee9e3" />}

      {buckets.map((b, i) => (
        <g key={b.da} onClick={onSelect ? () => onSelect(selezionato === i ? null : i) : undefined} style={{ cursor: onSelect && b.n ? "pointer" : "default" }}>
          {/* area cliccabile a tutta altezza */}
          <rect x={padL + i * bw} y={padT} width={bw} height={ih} fill="transparent" />
          {b.n > 0 && (
            <rect
              x={padL + i * bw + bw * 0.12} width={Math.max(1, bw * 0.76)}
              y={yN(b.n)} height={padT + ih - yN(b.n)}
              fill={selezionato === i ? ARANCIO : b.primaDellInizio ? GRIGIO : TEAL} opacity={selezionato === i ? 1 : 0.85} rx={1}
            >
              <title>{`${b.da}${granularita === "settimana" ? ` → ${b.a}` : ""}: ${b.n} disegni${b.primaDellInizio ? " (prima dell'inizio produzione)" : ""}`}</title>
            </rect>
          )}
        </g>
      ))}

      {marker(marcatori.inizio, TEAL, false, "inizio")}
      {marker(marcatori.fine, TEAL, true, "fine")}
      {marker(marcatori.oggi, ROSSO, false, "oggi")}

      <polyline points={linea} fill="none" stroke="#1a1714" strokeWidth={compatto ? 1.5 : 2} strokeLinejoin="round" />

      {mesi.map(m => (
        <text key={m.x} x={m.x + 2} y={H - 8} fontSize={10} fill="#6b7280" style={{ textTransform: "uppercase" }}>{m.label}</text>
      ))}
    </svg>
  );
}
