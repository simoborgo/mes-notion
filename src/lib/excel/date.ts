const MESI_ABB = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
export const MESI_IT = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

export function fmtDateIt(d: Date): string {
  return `${d.getDate()} ${MESI_ABB[d.getMonth()]} ${d.getFullYear()}`;
}

// Data estesa, mese per esteso capitalizzato — usata per il Titolo+Data di ogni singolo carico
// nel Programma Riunione, dove ogni carico ha ormai la sua riga (non più un elenco compatto).
export function fmtDateEsteso(d: Date): string {
  return `${d.getDate()} ${MESI_IT[d.getMonth()]} ${d.getFullYear()}`;
}
