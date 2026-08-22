import type { Pool, PoolClient } from "pg";
import { pool } from "./db";

// Motore di magazzino generico condiviso tra tutte le categorie di materiale (Vernici oggi;
// Legname/Tranciato/Bordi/Metalli in futuro). Non conosce mai la tabella anagrafica specifica:
// lavora solo con entitaId (UUID della riga anagrafica di quella categoria) + numeri.
export type CategoriaMagazzino = "vernici"; // estendere qui quando arrivano le altre categorie
// "segnalazione": movimento "leggero" senza quantità/giacenza (quantita = 0) — l'operatore
// dichiara di aver usato l'entità senza pesarla/contarla, solo per tenere traccia di chi/quando.
export type MovimentoMagazzinoTipo = "carico" | "scarico" | "rettifica" | "segnalazione";

export interface MovimentoMagazzino {
  id: string;
  categoria: CategoriaMagazzino;
  entitaId: string;
  codice: string | null;
  tipo: MovimentoMagazzinoTipo;
  quantita: number;
  giacenzaPrecedente: number;
  giacenzaRisultante: number;
  operatore: string;
  fonte: "mes";
  note: string | null;
  creatoIl: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): MovimentoMagazzino {
  return {
    id: r.id,
    categoria: r.categoria,
    entitaId: r.entita_id,
    codice: r.codice,
    tipo: r.tipo,
    quantita: Number(r.quantita),
    giacenzaPrecedente: Number(r.giacenza_precedente),
    giacenzaRisultante: Number(r.giacenza_risultante),
    operatore: r.operatore,
    fonte: r.fonte,
    note: r.note,
    creatoIl: r.creato_il,
  };
}

export async function registraMovimento(entry: {
  categoria: CategoriaMagazzino;
  entitaId: string;
  codice: string | null;
  tipo: MovimentoMagazzinoTipo;
  quantita: number;
  giacenzaPrecedente: number;
  giacenzaRisultante: number;
  operatore: string;
  note?: string | null;
}, executor: Pool | PoolClient = pool): Promise<MovimentoMagazzino> {
  const { rows } = await executor.query(
    `INSERT INTO movimenti_magazzino (categoria, entita_id, codice, tipo, quantita, giacenza_precedente, giacenza_risultante, operatore, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [entry.categoria, entry.entitaId, entry.codice, entry.tipo, entry.quantita, entry.giacenzaPrecedente, entry.giacenzaRisultante, entry.operatore, entry.note ?? null]
  );
  return mapRow(rows[0]);
}

export async function getMovimentiByEntita(categoria: CategoriaMagazzino, entitaId: string, limit = 50): Promise<MovimentoMagazzino[]> {
  const { rows } = await pool.query(
    `SELECT * FROM movimenti_magazzino WHERE categoria = $1 AND entita_id = $2 ORDER BY creato_il DESC LIMIT $3`,
    [categoria, entitaId, limit]
  );
  return rows.map(mapRow);
}
