import { pool } from "./db";
import type { Operatore } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): Operatore {
  return {
    id: r.id,
    matricola: r.matricola,
    cognome: r.cognome,
    nome: r.nome,
    reparto: r.reparto,
    tipo: r.tipo,
    azienda: r.azienda,
    inForza: r.in_forza,
  };
}

// Operatori "in forza" a una data specifica (passata, odierna o futura), in base allo storico
// periodi — non al solo booleano operatori.in_forza che riflette solo lo stato odierno. Un
// operatore può avere più periodi nel tempo (tipico degli esterni, assunti/cessati più volte).
// Semantica esclusiva: nel giorno stesso di data_fine l'operatore è già escluso.
export async function getOperatoriInForzaAlla(data: string): Promise<Operatore[]> {
  const { rows } = await pool.query(
    `SELECT o.* FROM operatori o
     WHERE EXISTS (
       SELECT 1 FROM operatori_periodi_impiego p
       WHERE p.operatore_id = o.id
         AND p.data_inizio <= $1
         AND (p.data_fine IS NULL OR $1 < p.data_fine)
     )
     ORDER BY o.cognome ASC`,
    [data],
  );
  return rows.map(mapRow);
}

// Chiude l'eventuale periodo aperto di un operatore (transizione inForza true -> false).
export async function chiudiPeriodoAperto(operatoreId: string, dataFine: string): Promise<void> {
  await pool.query(
    `UPDATE operatori_periodi_impiego SET data_fine = $2 WHERE operatore_id = $1 AND data_fine IS NULL`,
    [operatoreId, dataFine],
  );
}

// Apre un nuovo periodo per un operatore (transizione inForza false -> true, o creazione).
export async function apriPeriodo(operatoreId: string, dataInizio: string): Promise<void> {
  await pool.query(
    `INSERT INTO operatori_periodi_impiego (operatore_id, data_inizio) VALUES ($1, $2)`,
    [operatoreId, dataInizio],
  );
}
