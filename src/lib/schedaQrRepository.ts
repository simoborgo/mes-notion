import { randomBytes } from "crypto";
import { pool } from "./db";

// Alfabeto senza caratteri ambigui (0/O, 1/I/L): il codice è stampato anche in chiaro sotto il QR
// per essere digitato a mano se il QR è rovinato.
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LUNGHEZZA = 8;

export function generaQrCodice(): string {
  const bytes = randomBytes(LUNGHEZZA);
  let out = "";
  for (let i = 0; i < LUNGHEZZA; i++) out += ALFABETO[bytes[i] % ALFABETO.length];
  return out;
}

// Restituisce il codice QR della scheda, generandolo al primo bisogno (le schede già importate non
// ne hanno uno). L'UPDATE condizionale + indice univoco rendono sicura sia la concorrenza (due
// stampe contemporanee ottengono lo stesso codice) sia la rara collisione (si riprova).
export async function getOrCreateQrCodice(schedaId: string): Promise<string> {
  for (let tentativo = 0; tentativo < 5; tentativo++) {
    const esistente = await pool.query(`SELECT qr_codice FROM schede WHERE id = $1`, [schedaId]);
    if (esistente.rows.length === 0) throw new Error(`Scheda non trovata: ${schedaId}`);
    if (esistente.rows[0].qr_codice) return esistente.rows[0].qr_codice as string;

    try {
      const { rows } = await pool.query(
        `UPDATE schede SET qr_codice = $2 WHERE id = $1 AND qr_codice IS NULL RETURNING qr_codice`,
        [schedaId, generaQrCodice()],
      );
      if (rows.length > 0) return rows[0].qr_codice as string;
      // un'altra richiesta l'ha assegnato nel frattempo: al giro successivo lo si legge
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e; // 23505 = collisione sul codice: riprova
    }
  }
  throw new Error("Impossibile generare un codice QR univoco");
}
