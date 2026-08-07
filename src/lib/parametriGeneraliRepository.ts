import { pool } from "./db";

// Impostazioni aziendali globali, riga singleton (id=1). Prima voce: costo orario medio della
// manodopera interna, usato dal Previsionale per stimare le ore di un'offerta senza righe
// articolo (ore = valore_commessa / costo_orario_manodopera).
export async function getCostoOrarioManodopera(): Promise<number> {
  const { rows } = await pool.query(`SELECT costo_orario_manodopera FROM parametri_generali WHERE id = 1`);
  return rows[0] ? Number(rows[0].costo_orario_manodopera) : 0;
}

export async function aggiornaCostoOrarioManodopera(valore: number): Promise<number> {
  const { rows } = await pool.query(
    `UPDATE parametri_generali SET costo_orario_manodopera = $1, aggiornato_il = now() WHERE id = 1 RETURNING costo_orario_manodopera`,
    [valore]
  );
  return Number(rows[0].costo_orario_manodopera);
}
