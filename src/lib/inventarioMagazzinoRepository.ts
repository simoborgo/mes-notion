import { pool } from "./db";
import type { CategoriaMagazzino } from "./magazzinoRepository";

export type InventarioMagazzinoStato = "aperto" | "chiuso";

// Vocabolario di ambito specifico di Vernici — una categoria futura con esigenze diverse
// estenderà questa union con i propri valori.
export type AmbitoMagazzinoVernici = "tutto" | "tipologia" | "colore_codice";

export const AMBITO_VERNICI_LABEL: Record<AmbitoMagazzinoVernici, string> = {
  tutto: "Tutto il catalogo",
  tipologia: "Tipologia",
  colore_codice: "Colore/codice",
};

export interface InventarioMagazzinoSessione {
  id: string;
  categoria: CategoriaMagazzino;
  stato: InventarioMagazzinoStato;
  ambito: AmbitoMagazzinoVernici;
  ambitoValore: string | null;
  apertoDa: string;
  apertoIl: string;
  chiusoDa: string | null;
  chiusoIl: string | null;
  note: string | null;
}

export interface InventarioMagazzinoRiga {
  id: string;
  inventarioId: string;
  entitaId: string;
  codice: string | null;
  descrizione: string | null;
  giacenzaTeorica: number;
  giacenzaContata: number | null;
  scostamento: number | null;
  contatoDa: string | null;
  contatoIl: string | null;
  movimentoId: string | null;
  creatoIl: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSessione(r: any): InventarioMagazzinoSessione {
  return {
    id: r.id,
    categoria: r.categoria,
    stato: r.stato,
    ambito: r.ambito,
    ambitoValore: r.ambito_valore,
    apertoDa: r.aperto_da,
    apertoIl: r.aperto_il,
    chiusoDa: r.chiuso_da,
    chiusoIl: r.chiuso_il,
    note: r.note,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRiga(r: any): InventarioMagazzinoRiga {
  return {
    id: r.id,
    inventarioId: r.inventario_id,
    entitaId: r.entita_id,
    codice: r.codice,
    descrizione: r.descrizione,
    giacenzaTeorica: Number(r.giacenza_teorica),
    giacenzaContata: r.giacenza_contata != null ? Number(r.giacenza_contata) : null,
    scostamento: r.scostamento != null ? Number(r.scostamento) : null,
    contatoDa: r.contato_da,
    contatoIl: r.contato_il,
    movimentoId: r.movimento_id,
    creatoIl: r.creato_il,
  };
}

export async function apriInventario({
  categoria,
  ambito = "tutto",
  ambitoValore,
  operatore,
  righe,
}: {
  categoria: CategoriaMagazzino;
  ambito?: AmbitoMagazzinoVernici;
  ambitoValore?: string | null;
  operatore: string;
  righe: { entitaId: string; codice: string | null; descrizione: string | null; giacenzaTeorica: number }[];
}): Promise<InventarioMagazzinoSessione> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let sessioneRow;
    try {
      const res = await client.query(
        `INSERT INTO inventari_magazzino (categoria, ambito, ambito_valore, aperto_da) VALUES ($1,$2,$3,$4) RETURNING *`,
        [categoria, ambito, ambitoValore ?? null, operatore]
      );
      sessioneRow = res.rows[0];
    } catch (e) {
      await client.query("ROLLBACK");
      if ((e as { code?: string }).code === "23505") {
        throw new Error(`Esiste già un inventario ${categoria} aperto — chiudilo prima di aprirne uno nuovo`);
      }
      throw e;
    }
    for (const r of righe) {
      await client.query(
        `INSERT INTO inventario_righe_magazzino (inventario_id, entita_id, codice, descrizione, giacenza_teorica)
         VALUES ($1,$2,$3,$4,$5)`,
        [sessioneRow.id, r.entitaId, r.codice, r.descrizione, r.giacenzaTeorica]
      );
    }
    await client.query("COMMIT");
    return mapSessione(sessioneRow);
  } finally {
    client.release();
  }
}

export async function getInventarioAperto(categoria: CategoriaMagazzino): Promise<InventarioMagazzinoSessione | null> {
  const { rows } = await pool.query(`SELECT * FROM inventari_magazzino WHERE categoria = $1 AND stato = 'aperto' LIMIT 1`, [categoria]);
  return rows[0] ? mapSessione(rows[0]) : null;
}

export async function getInventarioById(id: string): Promise<InventarioMagazzinoSessione | null> {
  const { rows } = await pool.query(`SELECT * FROM inventari_magazzino WHERE id = $1`, [id]);
  return rows[0] ? mapSessione(rows[0]) : null;
}

export async function getInventariChiusi(categoria: CategoriaMagazzino, limit = 50): Promise<InventarioMagazzinoSessione[]> {
  const { rows } = await pool.query(
    `SELECT * FROM inventari_magazzino WHERE categoria = $1 AND stato = 'chiuso' ORDER BY chiuso_il DESC LIMIT $2`,
    [categoria, limit]
  );
  return rows.map(mapSessione);
}

export async function getRigaInventario(inventarioId: string, entitaId: string): Promise<InventarioMagazzinoRiga | null> {
  const { rows } = await pool.query(
    `SELECT * FROM inventario_righe_magazzino WHERE inventario_id = $1 AND entita_id = $2`,
    [inventarioId, entitaId]
  );
  return rows[0] ? mapRiga(rows[0]) : null;
}

export async function getRigheByInventario(inventarioId: string): Promise<InventarioMagazzinoRiga[]> {
  const { rows } = await pool.query(
    `SELECT * FROM inventario_righe_magazzino WHERE inventario_id = $1 ORDER BY descrizione`,
    [inventarioId]
  );
  return rows.map(mapRiga);
}

export async function registraConteggio(
  inventarioId: string,
  entitaId: string,
  { giacenzaContata, operatore, movimentoId }: { giacenzaContata: number; operatore: string; movimentoId: string | null }
): Promise<InventarioMagazzinoRiga> {
  const { rows } = await pool.query(
    `UPDATE inventario_righe_magazzino
     SET giacenza_contata = $3, contato_da = $4, contato_il = now(), movimento_id = $5
     WHERE inventario_id = $1 AND entita_id = $2
     RETURNING *`,
    [inventarioId, entitaId, giacenzaContata, operatore, movimentoId]
  );
  return mapRiga(rows[0]);
}

export async function chiudiInventario(id: string, operatore: string, note?: string | null): Promise<InventarioMagazzinoSessione> {
  const { rows } = await pool.query(
    `UPDATE inventari_magazzino SET stato = 'chiuso', chiuso_da = $2, chiuso_il = now(), note = COALESCE($3, note)
     WHERE id = $1 RETURNING *`,
    [id, operatore, note ?? null]
  );
  return mapSessione(rows[0]);
}
