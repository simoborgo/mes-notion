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

export interface OrariTurno {
  turnoFerialeInizio: string;
  turnoFerialeFine: string;
  turnoFerialePausaInizio: string;
  turnoFerialePausaFine: string;
  turnoSabatoInizio: string;
  turnoSabatoFine: string;
}

// TIME di postgres torna come "HH:MM:SS" — troncato a "HH:MM" per la UI e per orarioChiusuraPresunta.
function riga(r: Record<string, string>): OrariTurno {
  return {
    turnoFerialeInizio: r.turno_feriale_inizio.slice(0, 5),
    turnoFerialeFine: r.turno_feriale_fine.slice(0, 5),
    turnoFerialePausaInizio: r.turno_feriale_pausa_inizio.slice(0, 5),
    turnoFerialePausaFine: r.turno_feriale_pausa_fine.slice(0, 5),
    turnoSabatoInizio: r.turno_sabato_inizio.slice(0, 5),
    turnoSabatoFine: r.turno_sabato_fine.slice(0, 5),
  };
}

export async function getOrariTurno(): Promise<OrariTurno> {
  const { rows } = await pool.query(
    `SELECT turno_feriale_inizio, turno_feriale_fine, turno_feriale_pausa_inizio, turno_feriale_pausa_fine,
            turno_sabato_inizio, turno_sabato_fine
     FROM parametri_generali WHERE id = 1`
  );
  return riga(rows[0]);
}

export async function aggiornaOrariTurno(valori: OrariTurno): Promise<OrariTurno> {
  const { rows } = await pool.query(
    `UPDATE parametri_generali SET
       turno_feriale_inizio = $1, turno_feriale_fine = $2,
       turno_feriale_pausa_inizio = $3, turno_feriale_pausa_fine = $4,
       turno_sabato_inizio = $5, turno_sabato_fine = $6,
       aggiornato_il = now()
     WHERE id = 1
     RETURNING turno_feriale_inizio, turno_feriale_fine, turno_feriale_pausa_inizio, turno_feriale_pausa_fine,
               turno_sabato_inizio, turno_sabato_fine`,
    [
      valori.turnoFerialeInizio, valori.turnoFerialeFine,
      valori.turnoFerialePausaInizio, valori.turnoFerialePausaFine,
      valori.turnoSabatoInizio, valori.turnoSabatoFine,
    ]
  );
  return riga(rows[0]);
}
