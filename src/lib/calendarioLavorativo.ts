// Giorni lavorativi italiani (lun-ven, festivi nazionali esclusi) — Fase 5.3 Previsionale
// (distribuzione mensile delle ore, capacità per reparto). Niente dipendenza esterna: calcolo
// diretto, incluso il calcolo della Pasqua (algoritmo di Gauss/Meeus) per la Pasquetta, l'unico
// festivo mobile italiano.

function pasqua(anno: number): { mese: number; giorno: number } {
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = aprile
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return { mese, giorno };
}

function pasquetta(anno: number): { mese: number; giorno: number } {
  const p = pasqua(anno);
  const dt = new Date(anno, p.mese - 1, p.giorno + 1);
  return { mese: dt.getMonth() + 1, giorno: dt.getDate() };
}

function festiviAnno(anno: number): Set<string> {
  const fissi: [number, number][] = [
    [1, 1], [1, 6], [4, 25], [5, 1], [6, 2], [8, 15], [11, 1], [12, 8], [12, 25], [12, 26],
  ];
  const key = (m: number, d: number) => `${anno}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const set = new Set(fissi.map(([m, d]) => key(m, d)));
  const pq = pasquetta(anno);
  set.add(key(pq.mese, pq.giorno));
  return set;
}

const cacheFestivi = new Map<number, Set<string>>();
function festivi(anno: number): Set<string> {
  let s = cacheFestivi.get(anno);
  if (!s) { s = festiviAnno(anno); cacheFestivi.set(anno, s); }
  return s;
}

function fmtData(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function giornoLavorativo(d: Date): boolean {
  const weekday = d.getDay(); // 0 = domenica, 6 = sabato
  if (weekday === 0 || weekday === 6) return false;
  return !festivi(d.getFullYear()).has(fmtData(d));
}

// Variante solo per l'APS (apsSchedulerRepository.ts/apsGanttRepository.ts) — il sabato è
// lavorativo (turno configurato in Admin → Orari Turno, sempre presente, colonne NOT NULL).
// Deliberatamente SEPARATA da giornoLavorativo(): quest'ultima alimenta anche il Previsionale
// (giorniLavorativiMese, capacityPlannerRepository.ts) che non deve cambiare capacità includendo
// il sabato senza che sia stato richiesto.
export function giornoLavorativoAps(d: Date): boolean {
  if (d.getDay() === 0) return false; // solo la domenica esclusa
  return !festivi(d.getFullYear()).has(fmtData(d));
}

// Conta i giorni lavorativi nell'intervallo [dataInizio, dataFine], estremi inclusi.
// Date in formato "YYYY-MM-DD" — calcolo esplicito su anno/mese/giorno (non new Date(str) +
// aritmetica su ISO string) per evitare spostamenti di fuso orario, stessa tecnica già usata
// altrove nel progetto (VistaOggi.tsx, ore/presenti/route.ts).
export function giorniLavorativi(dataInizioStr: string, dataFineStr: string): number {
  const [y1, m1, d1] = dataInizioStr.split("-").map(Number);
  const [y2, m2, d2] = dataFineStr.split("-").map(Number);
  const inizio = new Date(y1, m1 - 1, d1);
  const fine = new Date(y2, m2 - 1, d2);
  if (inizio > fine) return 0;
  let count = 0;
  for (let dt = new Date(inizio); dt <= fine; dt.setDate(dt.getDate() + 1)) {
    if (giornoLavorativo(dt)) count++;
  }
  return count;
}

// Giorni lavorativi dell'intero mese di calendario (anno, mese 1-based) — usato per la
// capacità grezza di un reparto in quel mese, indipendentemente dalle offerte.
export function giorniLavorativiMese(anno: number, mese1based: number): number {
  const inizio = fmtData(new Date(anno, mese1based - 1, 1));
  const fine = fmtData(new Date(anno, mese1based, 0)); // giorno 0 del mese dopo = ultimo del mese
  return giorniLavorativi(inizio, fine);
}

// Primo/ultimo giorno del mese "YYYY-MM" come stringa "YYYY-MM-DD" — per ritagliare
// l'intervallo di un'offerta sui confini di un singolo mese di calendario.
export function primoGiornoMese(meseStr: string): string {
  const [anno, mese] = meseStr.split("-").map(Number);
  return fmtData(new Date(anno, mese - 1, 1));
}
export function ultimoGiornoMese(meseStr: string): string {
  const [anno, mese] = meseStr.split("-").map(Number);
  return fmtData(new Date(anno, mese, 0));
}

// Orizzonte di default per il Previsionale: il mese corrente + gli n-1 successivi.
export function mesiOrizzonteDaOggi(n: number): string[] {
  const oggi = new Date();
  const mesi: string[] = [];
  let anno = oggi.getFullYear(), mese = oggi.getMonth() + 1;
  for (let i = 0; i < n; i++) {
    mesi.push(`${anno}-${String(mese).padStart(2, "0")}`);
    mese++;
    if (mese > 12) { mese = 1; anno++; }
  }
  return mesi;
}

// Elenco dei mesi "YYYY-MM" toccati dall'intervallo [dataInizio, dataFine], estremi inclusi.
export function mesiCoperti(dataInizioStr: string, dataFineStr: string): string[] {
  const [y1, m1] = dataInizioStr.split("-").map(Number);
  const [y2, m2] = dataFineStr.split("-").map(Number);
  const mesi: string[] = [];
  let anno = y1, mese = m1;
  while (anno < y2 || (anno === y2 && mese <= m2)) {
    mesi.push(`${anno}-${String(mese).padStart(2, "0")}`);
    mese++;
    if (mese > 12) { mese = 1; anno++; }
  }
  return mesi;
}
