import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
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

export async function impostaPin(matricola: string, pin: string): Promise<void> {
  const pinHash = hashPin(pin);
  await pool.query(
    `INSERT INTO operatori_pin (matricola, pin_hash) VALUES ($1, $2)
     ON CONFLICT (matricola) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, updated_at = now()`,
    [matricola, pinHash]
  );
}

export async function verificaPin(matricola: string, pin: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT pin_hash FROM operatori_pin WHERE matricola = $1`, [matricola]);
  if (rows.length === 0) return false;
  return verificaHash(pin, rows[0].pin_hash);
}

export async function getMatricoleConPin(): Promise<Set<string>> {
  const { rows } = await pool.query(`SELECT matricola FROM operatori_pin`);
  return new Set(rows.map(r => r.matricola));
}

export async function rimuoviPin(matricola: string): Promise<void> {
  await pool.query(`DELETE FROM operatori_pin WHERE matricola = $1`, [matricola]);
}
