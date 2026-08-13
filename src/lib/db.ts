import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
});

// pg parsa le colonne DATE come mezzanotte in timezone locale (new Date(anno, mese-1, giorno)),
// non UTC — un .toISOString() successivo sposta la data indietro di un giorno su qualunque
// timezone avanti rispetto a UTC (es. Europe/Rome). Rileggere con i getter locali invece di UTC
// restituisce esattamente la data originale, a prescindere dal timezone del processo.
export function dateToStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
