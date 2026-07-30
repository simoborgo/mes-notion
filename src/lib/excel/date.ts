const MESI_ABB = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
export const MESI_IT = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

export function fmtDateIt(d: Date): string {
  return `${d.getDate()} ${MESI_ABB[d.getMonth()]} ${d.getFullYear()}`;
}

// Tutte le date tranne l'ultima omettono l'anno (per compattezza) — replica esatta di
// fmt_carichi_multi nella skill "modar-programma-riunione".
export function fmtCarichiMulti(dates: Date[]): string {
  if (!dates.length) return "—";
  if (dates.length === 1) return fmtDateIt(dates[0]);
  const parts = dates.slice(0, -1).map((d) => `${d.getDate()} ${MESI_ABB[d.getMonth()]}`);
  const ultima = fmtDateIt(dates[dates.length - 1]);
  return [...parts, ultima].join(", ");
}
