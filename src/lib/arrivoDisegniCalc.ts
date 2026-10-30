// Calcoli puri (nessun accesso al DB, usabili anche lato client) per la dashboard di arrivo dei
// disegni di una commessa. Un "disegno" è una riga di `schede` (Scheda o Sottoscheda) e il giorno
// di arrivo è `data_scheda_ricevuta` (oggi = data di import del PDF nel MES). Le date sono stringhe
// "YYYY-MM-DD" e si calcolano in UTC, così nessun fuso orario può sfasare un giorno.

export interface GiornoArrivo {
  giorno: string;
  n: number;
  completate: number;
  odp: string[];
}

export interface ArrivoCommessa {
  commessaId: string;
  giorni: GiornoArrivo[]; // solo schede con data di arrivo, ordinate per giorno
  senzaData: number;      // schede senza data_scheda_ricevuta: non collocabili nel tempo
  totale: number;         // con e senza data
  completate: number;     // con e senza data
}

export type Granularita = "giorno" | "settimana";

export interface Bucket {
  da: string;   // primo giorno del bucket (per la settimana: il lunedì)
  a: string;    // ultimo giorno del bucket
  n: number;
  cumulato: number;
  odp: string[];
  primaDellInizio: boolean; // arrivato prima dell'inizio produzione inserito
}

const MS_GIORNO = 86_400_000;

function toMs(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addGiorni(s: string, n: number): string {
  return fromMs(toMs(s) + n * MS_GIORNO);
}

export function diffGiorni(da: string, a: string): number {
  return Math.round((toMs(a) - toMs(da)) / MS_GIORNO);
}

export function lunedi(s: string): string {
  const dow = new Date(toMs(s)).getUTCDay(); // 0 = domenica
  return addGiorni(s, -((dow + 6) % 7));
}

export function minMax(a: string, b: string, scegli: "min" | "max"): string {
  return (scegli === "min") === (a <= b) ? a : b;
}

// Serie continua di bucket (anche vuoti) da `da` ad `a`, con il cumulato degli arrivi.
export function costruisciBucket(
  giorni: GiornoArrivo[], granularita: Granularita, da: string, a: string, inizioProduzione: string | null,
): Bucket[] {
  const passo = granularita === "settimana" ? 7 : 1;
  const start = granularita === "settimana" ? lunedi(da) : da;
  const perGiorno = new Map(giorni.map(g => [g.giorno, g]));
  const out: Bucket[] = [];
  let cumulato = 0;
  for (let d = start; d <= a; d = addGiorni(d, passo)) {
    const fine = addGiorni(d, passo - 1);
    let n = 0;
    const odp = new Set<string>();
    for (let k = 0; k < passo; k++) {
      const g = perGiorno.get(addGiorni(d, k));
      if (g) { n += g.n; g.odp.forEach(o => odp.add(o)); }
    }
    cumulato += n;
    out.push({
      da: d, a: fine, n, cumulato, odp: [...odp].sort(),
      primaDellInizio: !!inizioProduzione && fine < inizioProduzione,
    });
  }
  return out;
}

// Giorni dal giorno 0 in cui è arrivata la quota indicata (0-1) dei disegni con data.
export function giorniPerQuota(giorni: GiornoArrivo[], quota: number, giorno0: string): number | null {
  const tot = giorni.reduce((s, g) => s + g.n, 0);
  if (!tot) return null;
  let cum = 0;
  for (const g of giorni) {
    cum += g.n;
    if (cum / tot >= quota) return Math.max(0, diffGiorni(giorno0, g.giorno));
  }
  return null;
}

export interface RiepilogoArrivo {
  conData: number;
  giorno0: string | null;      // inizio produzione, altrimenti il primo arrivo
  primoArrivo: string | null;
  ultimoArrivo: string | null;
  prima: number;               // arrivati prima dell'inizio produzione
  picco: { da: string; n: number } | null; // settimana con più arrivi
  giorni50: number | null;
  giorni80: number | null;
}

export function riepilogo(arrivo: ArrivoCommessa, inizioProduzione: string | null): RiepilogoArrivo {
  const giorni = arrivo.giorni;
  const conData = giorni.reduce((s, g) => s + g.n, 0);
  const primoArrivo = giorni[0]?.giorno ?? null;
  const ultimoArrivo = giorni[giorni.length - 1]?.giorno ?? null;
  const giorno0 = inizioProduzione ?? primoArrivo;
  const perSettimana = new Map<string, number>();
  for (const g of giorni) {
    const w = lunedi(g.giorno);
    perSettimana.set(w, (perSettimana.get(w) ?? 0) + g.n);
  }
  let picco: RiepilogoArrivo["picco"] = null;
  for (const [da, n] of perSettimana) if (!picco || n > picco.n) picco = { da, n };
  return {
    conData, giorno0, primoArrivo, ultimoArrivo,
    prima: inizioProduzione ? giorni.filter(g => g.giorno < inizioProduzione).reduce((s, g) => s + g.n, 0) : 0,
    picco,
    giorni50: giorno0 ? giorniPerQuota(giorni, 0.5, giorno0) : null,
    giorni80: giorno0 ? giorniPerQuota(giorni, 0.8, giorno0) : null,
  };
}
