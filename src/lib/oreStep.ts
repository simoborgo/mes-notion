// L'amministrazione contabilizza le ore a step minimi di 15 minuti: ogni valore di ore
// registrato (manuale o da segmenti tablet) deve essere un multiplo di 0.25.
export const STEP_ORE = 0.25;

export function arrotondaQuarto(n: number): number {
  return Math.round(n / STEP_ORE) * STEP_ORE;
}

export function èMultiploQuarto(n: number): boolean {
  return Math.abs(n / STEP_ORE - Math.round(n / STEP_ORE)) < 1e-9;
}

// Ripartisce `totale` ore su `n` voci (lotto di ODP) in multipli di 15 minuti. Il totale viene
// prima arrotondato al quarto d'ora, poi i quarti si distribuiscono il più equamente possibile:
// le prime voci ricevono il quarto in più (es. 2h su 3 ODP → 0.75 + 0.75 + 0.5), così la somma
// torna sempre esattamente al totale arrotondato.
export function ripartisciOre(totale: number, n: number): number[] {
  const quarti = Math.round(totale / STEP_ORE);
  const base = Math.floor(quarti / n);
  const extra = quarti - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) * STEP_ORE);
}

// Ripartisce la giornata tablet di un operatore sugli ODP lavorati, in multipli di 15 minuti, così
// che la somma torni al totale della giornata arrotondato al quarto (arrotondare ogni ODP per conto
// suo faceva perdere fino a mezz'ora al giorno con 5-6 ODP). Regola decisa con l'utente 2026-10-31:
// ogni ODP riceve i quarti interi lavorati; i quarti mancanti vanno prima agli ODP andati più vicini
// al quarto successivo (resto maggiore), e se non bastano si arrotonda per eccesso l'ultimo ODP lavorato.
export function ripartisciGiornata(voci: { odp: string; ore: number; ultimoAlle: number }[]): Map<string, number> {
  const quartiTotali = Math.round(voci.reduce((s, v) => s + v.ore, 0) / STEP_ORE);
  const righe = voci.map(v => {
    const quarti = v.ore / STEP_ORE;
    // epsilon: 0.75/0.25 può dare 2.9999999 in floating point
    const interi = Math.floor(quarti + 1e-9);
    return { ...v, quarti: interi, resto: quarti - interi };
  });
  let mancanti = quartiTotali - righe.reduce((s, r) => s + r.quarti, 0);
  for (const r of [...righe].filter(r => r.resto > 1e-9).sort((a, b) => b.resto - a.resto || b.ultimoAlle - a.ultimoAlle)) {
    if (mancanti <= 0) break;
    r.quarti++;
    mancanti--;
  }
  if (mancanti > 0 && righe.length > 0) {
    righe.reduce((u, r) => (r.ultimoAlle > u.ultimoAlle ? r : u)).quarti += mancanti;
  }
  return new Map(righe.map(r => [r.odp, r.quarti * STEP_ORE]));
}

// "1.25" → "1h 15min", "0.5" → "30min", "2" → "2h"
export function fmtOreMinuti(ore: number): string {
  const tot = Math.round(ore * 60);
  const h = Math.floor(tot / 60);
  const m = tot % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}
