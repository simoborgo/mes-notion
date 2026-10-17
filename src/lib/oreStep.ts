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

// "1.25" → "1h 15min", "0.5" → "30min", "2" → "2h"
export function fmtOreMinuti(ore: number): string {
  const tot = Math.round(ore * 60);
  const h = Math.floor(tot / 60);
  const m = tot % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}
