import { pool } from "./db";
import type { AssenzaApprovata } from "./permessiRepository";

export interface AssenzaManuale {
  id: string;
  data: string;
  matricola: string;
  ore: number | null; // null = intera giornata
  modificataManualmente: boolean;
  createdAt: string;
  updatedAt: string;
}

// pg costruisce le colonne DATE come Date a mezzanotte locale — .toISOString() le
// convertirebbe in UTC e sposterebbe il giorno indietro con fusi orari positivi (bug
// noto già presente in oreRepository.ts, qui evitato leggendo i componenti locali).
function formatData(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): AssenzaManuale {
  return {
    id: r.id,
    data: r.data instanceof Date ? formatData(r.data) : r.data,
    matricola: r.matricola,
    ore: r.ore != null ? Number(r.ore) : null,
    modificataManualmente: r.modificata_manualmente,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getAssenzeManualiPerData(data: string): Promise<Map<string, AssenzaManuale>> {
  const { rows } = await pool.query(`SELECT * FROM ore_assenze WHERE data = $1`, [data]);
  const map = new Map<string, AssenzaManuale>();
  rows.forEach(r => map.set(r.matricola, mapRow(r)));
  return map;
}

// Usata dalla route lato utente (checkbox/ore manuali) — imposta sempre modificata_manualmente = true,
// così la riconciliazione automatica con Permessi non la tocca più finché non viene rimossa.
export async function upsertAssenzaManuale(data: string, matricola: string, ore: number | null): Promise<AssenzaManuale> {
  const { rows } = await pool.query(
    `INSERT INTO ore_assenze (data, matricola, ore, modificata_manualmente)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (data, matricola) DO UPDATE SET
       ore = EXCLUDED.ore, modificata_manualmente = true, updated_at = now()
     RETURNING *`,
    [data, matricola, ore]
  );
  return mapRow(rows[0]);
}

export async function eliminaAssenzaManuale(data: string, matricola: string): Promise<void> {
  await pool.query(`DELETE FROM ore_assenze WHERE data = $1 AND matricola = $2`, [data, matricola]);
}

// Da oraInizio/oraFine (formato "HH:MM"): null = entrambi assenti = permesso a giornata intera.
export function oreDaPermesso(a: AssenzaApprovata): number | null {
  if (!a.oraInizio || !a.oraFine) return null;
  const [h1, m1] = a.oraInizio.split(":").map(Number);
  const [h2, m2] = a.oraFine.split(":").map(Number);
  return Math.round(((h2 * 60 + m2) - (h1 * 60 + m1)) / 60 * 100) / 100;
}

function oreEqual(a: number | null, b: number | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) < 0.01;
}

// Riconciliazione batch (1 lettura + scritture solo se necessario) tra i permessi live trovati
// per la data indicata e le righe già salvate in ore_assenze. Non tocca mai le righe con
// modificata_manualmente = true — per quelle l'eventuale mismatch va solo segnalato come conflitto
// a monte (in api/ore/presenti), non risolto automaticamente qui.
export async function reconciliaAssenzeConPermessi(
  data: string,
  permessiPerMatricola: Map<string, number | null>
): Promise<Map<string, AssenzaManuale>> {
  const esistenti = await getAssenzeManualiPerData(data);

  for (const [matricola, oreDaPerm] of permessiPerMatricola) {
    const riga = esistenti.get(matricola);
    if (!riga) {
      const { rows } = await pool.query(
        `INSERT INTO ore_assenze (data, matricola, ore, modificata_manualmente)
         VALUES ($1, $2, $3, false)
         ON CONFLICT (data, matricola) DO NOTHING
         RETURNING *`,
        [data, matricola, oreDaPerm]
      );
      if (rows[0]) esistenti.set(matricola, mapRow(rows[0]));
    } else if (!riga.modificataManualmente && !oreEqual(riga.ore, oreDaPerm)) {
      const { rows } = await pool.query(
        `UPDATE ore_assenze SET ore = $3, updated_at = now() WHERE data = $1 AND matricola = $2 RETURNING *`,
        [data, matricola, oreDaPerm]
      );
      if (rows[0]) esistenti.set(matricola, mapRow(rows[0]));
    }
  }

  // Pulizia: righe auto-sincronizzate il cui permesso non c'è più per questa data.
  for (const [matricola, riga] of esistenti) {
    if (!riga.modificataManualmente && !permessiPerMatricola.has(matricola)) {
      await pool.query(`DELETE FROM ore_assenze WHERE data = $1 AND matricola = $2`, [data, matricola]);
      esistenti.delete(matricola);
    }
  }

  return esistenti;
}

export { oreEqual };
