// Il processo Node in produzione gira in UTC, non in Europe/Rome — `new Date().getHours()` e
// `.setHours()` interpretano quindi "le 18:00" del turno configurato in Impostazioni come 18:00
// UTC (= 20:00 italiane d'estate, 19:00 d'inverno), sfasando di 1-2h qualunque calcolo su orari
// di turno/pausa. Queste funzioni usano Intl (che conosce le regole di ora legale/solare di
// Europe/Rome) per convertire correttamente, indipendentemente dal fuso del processo.
const FUSO = "Europe/Rome";

// Esportata: utile ovunque serva leggere ora/minuti "come li vedrebbe qualcuno in Italia" da un
// istante UTC — es. formattazione di orari su pagine/PDF server-rendered (vedi ritiri/[id]/etichetta).
export function partiRoma(d: Date): { anno: number; mese: number; giorno: number; ore: number; minuti: number; secondi: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parti = Object.fromEntries(dtf.formatToParts(d).map(p => [p.type, p.value])) as Record<string, string>;
  return {
    anno: Number(parti.year), mese: Number(parti.month), giorno: Number(parti.day),
    ore: Number(parti.hour), minuti: Number(parti.minute), secondi: Number(parti.second),
  };
}

// Data odierna "YYYY-MM-DD" secondo il calendario di Europe/Rome (può differire da quello del
// processo Node nelle ore intorno alla mezzanotte).
export function dataOggiRoma(now: Date = new Date()): string {
  const p = partiRoma(now);
  return `${p.anno}-${String(p.mese).padStart(2, "0")}-${String(p.giorno).padStart(2, "0")}`;
}

// Giorno della settimana (0=domenica..6=sabato) secondo il calendario di Europe/Rome.
export function giornoSettimanaRoma(now: Date = new Date()): number {
  const p = partiRoma(now);
  return new Date(p.anno, p.mese - 1, p.giorno).getDay();
}

// Giorno della settimana di una data "YYYY-MM-DD" già nota (es. il campo `data` di un segmento)
// — costruzione a mezzanotte locale del calendario: stabile in qualunque fuso del processo,
// perché getDay() qui dipende solo dal calendario, non dall'ora.
export function giornoSettimanaDataStr(dataStr: string): number {
  const [anno, mese, giorno] = dataStr.split("-").map(Number);
  return new Date(anno, mese - 1, giorno).getDay();
}

// Converte una data "YYYY-MM-DD" + ora "HH:MM" *nel fuso di Europe/Rome* (es. gli orari di
// turno/pausa configurati in Impostazioni) nell'istante UTC corrispondente. Due passate: la
// prima stima l'offset trattando i componenti come se fossero già UTC, la seconda lo raffina
// ricampionandolo sull'istante corretto — gestisce così anche i minuti a cavallo di un cambio
// ora legale/solare senza offset hardcoded che si romperebbero da soli due volte l'anno.
export function orarioRomaAUtc(dataStr: string, hhmm: string): Date {
  const [anno, mese, giorno] = dataStr.split("-").map(Number);
  const [ore, minuti] = hhmm.split(":").map(Number);
  const target = Date.UTC(anno, mese - 1, giorno, ore, minuti, 0, 0);
  let istante = target;
  for (let i = 0; i < 2; i++) {
    const p = partiRoma(new Date(istante));
    const comeUtc = Date.UTC(p.anno, p.mese - 1, p.giorno, p.ore, p.minuti, p.secondi);
    const offsetMs = comeUtc - istante;
    istante = target - offsetMs;
  }
  return new Date(istante);
}

// Ore nette tra due istanti, sottraendo la sovrapposizione con la pausa pranzo configurata —
// solo nei giorni feriali (sabato/domenica non hanno una pausa configurata, vedi
// parametriGeneraliRepository: turno_sabato non ha colonne pausa).
export function oreNetteSottraendoPausa(
  inizio: Date, fine: Date, dataStr: string,
  pausa: { turnoFerialePausaInizio: string; turnoFerialePausaFine: string }
): number {
  const grezzeMs = fine.getTime() - inizio.getTime();
  const weekday = giornoSettimanaDataStr(dataStr);
  if (weekday === 0 || weekday === 6) return grezzeMs / 3_600_000;
  const pausaInizioUtc = orarioRomaAUtc(dataStr, pausa.turnoFerialePausaInizio).getTime();
  const pausaFineUtc = orarioRomaAUtc(dataStr, pausa.turnoFerialePausaFine).getTime();
  const overlapMs = Math.max(0, Math.min(fine.getTime(), pausaFineUtc) - Math.max(inizio.getTime(), pausaInizioUtc));
  return (grezzeMs - overlapMs) / 3_600_000;
}
