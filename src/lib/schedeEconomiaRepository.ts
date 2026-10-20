import { pool } from "./db";
import { getCostoOrarioManodopera } from "./parametriGeneraliRepository";

// Dati economici e contatori ore della Scheda. Il valore di vendita vive in colonna ma non è mai
// mappato in Scheda (src/lib/types.ts): quell'oggetto raggiunge ogni ruolo, qui lo legge solo
// chi ha già verificato il ruolo admin.

export async function getValoreVendita(schedaId: string): Promise<number | null> {
  const { rows } = await pool.query(`SELECT valore_vendita FROM schede WHERE id = $1`, [schedaId]);
  return rows[0]?.valore_vendita != null ? Number(rows[0].valore_vendita) : null;
}

export async function setValoreVendita(schedaId: string, valore: number | null): Promise<void> {
  await pool.query(`UPDATE schede SET valore_vendita = $1, aggiornato_il = now() WHERE id = $2`, [valore, schedaId]);
}

export interface ContatoriOre {
  // Ore registrate sull'ODP e sulle sue rilavorazioni (ODP/Rxx), rifacimenti inclusi: stessa
  // regola dei KPI Produzione (kpiProduzioneRepository.ts, ORE_ODP).
  oreConsumate: number;
  // Somma delle medie storiche per reparto dell'articolo (standard_reparto): è un valore per
  // ODP, non per pezzo. Null se l'articolo non ha ancora uno standard.
  oreStandard: number | null;
}

export async function getContatoriOre(odp: string, codiceArticolo: string): Promise<ContatoriOre> {
  const [consumate, standard] = await Promise.all([
    odp
      ? pool.query(
          `SELECT COALESCE(sum(ore), 0) AS ore FROM ore_registrate WHERE odp = $1 OR left(odp, length($1) + 2) = $1 || '/R'`,
          [odp],
        )
      : null,
    codiceArticolo
      ? pool.query(`SELECT sum(media_ore) AS ore FROM standard_reparto WHERE codice_articolo = $1`, [codiceArticolo])
      : null,
  ]);
  return {
    oreConsumate: consumate ? Number(consumate.rows[0].ore) : 0,
    oreStandard: standard?.rows[0]?.ore != null ? Number(standard.rows[0].ore) : null,
  };
}

export async function getTariffaOraria(): Promise<number> {
  return getCostoOrarioManodopera();
}
