import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { pool } from "./db";

const KEYLEN = 32;

function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

function verificaHash(pin: string, saltHash: string): boolean {
  const [salt, hash] = saltHash.split(":");
  if (!salt || !hash) return false;
  const calcolato = scryptSync(pin, salt, KEYLEN);
  const atteso = Buffer.from(hash, "hex");
  if (calcolato.length !== atteso.length) return false;
  return timingSafeEqual(calcolato, atteso);
}

// Impronta deterministica del PIN per ritrovare l'operatore dal solo PIN e garantirne l'unicità.
// Con 4 cifre lo spazio è di 10.000 valori: senza il segreto del server l'impronta non è invertibile
// da chi leggesse solo il DB, e il tentativo di indovinare il PIN è limitato dalla route (rate limit).
function lookupPin(pin: string): string {
  const segreto = process.env.JWT_SECRET;
  if (!segreto) throw new Error("JWT_SECRET non configurata");
  return createHmac("sha256", segreto).update(`operatori-pin-lookup:${pin}`).digest("hex");
}

export class PinInUsoError extends Error {
  constructor() {
    super("Questo PIN è già assegnato a un altro operatore: scegline uno diverso");
    this.name = "PinInUsoError";
  }
}

// Un altro operatore usa già questo PIN? Oltre all'impronta (solo chi l'ha già registrata), si
// verifica anche con l'hash scrypt gli operatori che non l'hanno ancora: durante la migrazione
// graduale due PIN uguali non devono sfuggire.
async function altroOperatoreConPin(pin: string, matricola: string): Promise<boolean> {
  const { rows: conLookup } = await pool.query(
    `SELECT 1 FROM operatori_pin WHERE pin_lookup = $1 AND matricola <> $2`,
    [lookupPin(pin), matricola],
  );
  if (conLookup.length > 0) return true;
  const { rows: senza } = await pool.query(
    `SELECT pin_hash FROM operatori_pin WHERE pin_lookup IS NULL AND matricola <> $1`,
    [matricola],
  );
  return senza.some(r => verificaHash(pin, r.pin_hash));
}

export async function impostaPin(matricola: string, pin: string): Promise<void> {
  if (await altroOperatoreConPin(pin, matricola)) throw new PinInUsoError();
  try {
    await pool.query(
      `INSERT INTO operatori_pin (matricola, pin_hash, pin_lookup) VALUES ($1, $2, $3)
       ON CONFLICT (matricola) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, pin_lookup = EXCLUDED.pin_lookup, updated_at = now()`,
      [matricola, hashPin(pin), lookupPin(pin)],
    );
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new PinInUsoError(); // corsa tra due impostazioni
    throw e;
  }
}

export async function verificaPin(matricola: string, pin: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT pin_hash, pin_lookup FROM operatori_pin WHERE matricola = $1`, [matricola]);
  if (rows.length === 0) return false;
  const ok = verificaHash(pin, rows[0].pin_hash);
  // Migrazione graduale: il PIN in chiaro lo conosciamo solo qui, quando è appena stato verificato.
  // Se è in conflitto con un altro operatore l'impronta resta vuota (accesso solo-PIN non attivo
  // per questo operatore finché non cambia PIN) e non si blocca nulla.
  if (ok && !rows[0].pin_lookup) {
    try {
      if (!(await altroOperatoreConPin(pin, matricola))) {
        await pool.query(`UPDATE operatori_pin SET pin_lookup = $2 WHERE matricola = $1 AND pin_lookup IS NULL`, [matricola, lookupPin(pin)]);
      }
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") console.error("[operatoriPin] registrazione impronta fallita:", e);
    }
  }
  return ok;
}

// Matricola dell'operatore che ha questo PIN, o null. Funziona solo per chi ha l'impronta registrata.
export async function trovaMatricolaDaPin(pin: string): Promise<string | null> {
  const { rows } = await pool.query(`SELECT matricola, pin_hash FROM operatori_pin WHERE pin_lookup = $1`, [lookupPin(pin)]);
  if (rows.length !== 1) return null;
  return verificaHash(pin, rows[0].pin_hash) ? (rows[0].matricola as string) : null;
}

export async function getMatricoleConPin(): Promise<Set<string>> {
  const { rows } = await pool.query(`SELECT matricola FROM operatori_pin`);
  return new Set(rows.map(r => r.matricola));
}

// Operatori che possono entrare con il solo PIN (impronta registrata).
export async function getMatricoleConPinSolo(): Promise<Set<string>> {
  const { rows } = await pool.query(`SELECT matricola FROM operatori_pin WHERE pin_lookup IS NOT NULL`);
  return new Set(rows.map(r => r.matricola));
}

export async function rimuoviPin(matricola: string): Promise<void> {
  await pool.query(`DELETE FROM operatori_pin WHERE matricola = $1`, [matricola]);
}
