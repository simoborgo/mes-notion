import { pool } from "./db";

// Giorni di chiusura aziendale per Rilevamento Ore — la sola presenza di una riga per una
// data indica "azienda chiusa". Usata da Vista Oggi e dalle stampe PDF per forzare il totale
// giornata a 0h in modo persistente (vedi schema_ore_giorni_chiusi.sql).
export async function isGiornoChiuso(data: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM ore_giorni_chiusi WHERE data = $1`, [data]);
  return rows.length > 0;
}

export async function setGiornoChiuso(data: string, chiuso: boolean): Promise<void> {
  if (chiuso) {
    await pool.query(`INSERT INTO ore_giorni_chiusi (data) VALUES ($1) ON CONFLICT (data) DO NOTHING`, [data]);
  } else {
    await pool.query(`DELETE FROM ore_giorni_chiusi WHERE data = $1`, [data]);
  }
}
