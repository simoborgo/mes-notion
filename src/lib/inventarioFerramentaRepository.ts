import { pool } from "./db";

export type InventarioAmbito = "tutto" | "kanban" | "ubicazione" | "sotto_scorta";
export type InventarioStato = "aperto" | "chiuso";

export interface InventarioSessione {
  id: string;
  stato: InventarioStato;
  ambito: InventarioAmbito;
  ambitoValore: string | null;
  apertoDa: string;
  apertoIl: string;
  chiusoDa: string | null;
  chiusoIl: string | null;
  note: string | null;
}

export interface InventarioRiga {
  id: string;
  inventarioId: string;
  articoloId: string;
  codiceOs1: string | null;
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
function mapSessione(r: any): InventarioSessione {
  return {
    id: r.id,
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
function mapRiga(r: any): InventarioRiga {
  return {
    id: r.id,
    inventarioId: r.inventario_id,
    articoloId: r.articolo_id,
    codiceOs1: r.codice_os1,
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
  ambito,
  ambitoValore,
  operatore,
  righe,
}: {
  ambito: InventarioAmbito;
  ambitoValore?: string | null;
  operatore: string;
  righe: { articoloId: string; codiceOs1: string | null; descrizione: string | null; giacenzaTeorica: number }[];
}): Promise<InventarioSessione> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let sessioneRow;
    try {
      const res = await client.query(
        `INSERT INTO inventari_ferramenta (ambito, ambito_valore, aperto_da) VALUES ($1,$2,$3) RETURNING *`,
        [ambito, ambitoValore ?? null, operatore]
      );
      sessioneRow = res.rows[0];
    } catch (e) {
      await client.query("ROLLBACK");
      if ((e as { code?: string }).code === "23505") {
        throw new Error("Esiste già un inventario aperto — chiudilo prima di aprirne uno nuovo");
      }
      throw e;
    }
    for (const r of righe) {
      await client.query(
        `INSERT INTO inventario_righe_ferramenta (inventario_id, articolo_id, codice_os1, descrizione, giacenza_teorica)
         VALUES ($1,$2,$3,$4,$5)`,
        [sessioneRow.id, r.articoloId, r.codiceOs1, r.descrizione, r.giacenzaTeorica]
      );
    }
    await client.query("COMMIT");
    return mapSessione(sessioneRow);
  } finally {
    client.release();
  }
}

export async function getInventarioAperto(): Promise<InventarioSessione | null> {
  const { rows } = await pool.query(`SELECT * FROM inventari_ferramenta WHERE stato = 'aperto' LIMIT 1`);
  return rows[0] ? mapSessione(rows[0]) : null;
}

export async function getInventarioById(id: string): Promise<InventarioSessione | null> {
  const { rows } = await pool.query(`SELECT * FROM inventari_ferramenta WHERE id = $1`, [id]);
  return rows[0] ? mapSessione(rows[0]) : null;
}

export async function getInventariChiusi(limit = 50): Promise<InventarioSessione[]> {
  const { rows } = await pool.query(
    `SELECT * FROM inventari_ferramenta WHERE stato = 'chiuso' ORDER BY chiuso_il DESC LIMIT $1`,
    [limit]
  );
  return rows.map(mapSessione);
}

export async function getRigaInventario(inventarioId: string, articoloId: string): Promise<InventarioRiga | null> {
  const { rows } = await pool.query(
    `SELECT * FROM inventario_righe_ferramenta WHERE inventario_id = $1 AND articolo_id = $2`,
    [inventarioId, articoloId]
  );
  return rows[0] ? mapRiga(rows[0]) : null;
}

export async function getRigheByInventario(inventarioId: string): Promise<InventarioRiga[]> {
  const { rows } = await pool.query(
    `SELECT * FROM inventario_righe_ferramenta WHERE inventario_id = $1 ORDER BY descrizione`,
    [inventarioId]
  );
  return rows.map(mapRiga);
}

export async function registraConteggio(
  inventarioId: string,
  articoloId: string,
  { giacenzaContata, operatore, movimentoId }: { giacenzaContata: number; operatore: string; movimentoId: string | null }
): Promise<InventarioRiga> {
  const { rows } = await pool.query(
    `UPDATE inventario_righe_ferramenta
     SET giacenza_contata = $3, contato_da = $4, contato_il = now(), movimento_id = $5
     WHERE inventario_id = $1 AND articolo_id = $2
     RETURNING *`,
    [inventarioId, articoloId, giacenzaContata, operatore, movimentoId]
  );
  return mapRiga(rows[0]);
}

export async function chiudiInventario(id: string, operatore: string, note?: string | null): Promise<InventarioSessione> {
  const { rows } = await pool.query(
    `UPDATE inventari_ferramenta SET stato = 'chiuso', chiuso_da = $2, chiuso_il = now(), note = COALESCE($3, note)
     WHERE id = $1 RETURNING *`,
    [id, operatore, note ?? null]
  );
  return mapSessione(rows[0]);
}
