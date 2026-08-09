import type { Pool, PoolClient } from "pg";
import { pool } from "./db";
import { generaCodicePubblico, trovaCodicePubblicoRiusabile } from "./barcodeVerniciatura";
import { validaCicloInTransazione } from "./cicliVerniciaturaRepository";
import type { Campionatura, CampionaturaFoto, EsitoCampionatura } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): Campionatura {
  return {
    id: r.id,
    cicloId: r.ciclo_id,
    cliente: r.cliente,
    codiceCampioneMaterialista: r.codice_campione_materialista,
    codicePubblico: r.codice_pubblico,
    dataCampionatura: r.data_campionatura instanceof Date ? r.data_campionatura.toISOString().slice(0, 10) : r.data_campionatura,
    esito: r.esito,
    note: r.note,
    driveFolderId: r.drive_folder_id,
    attivo: r.attivo,
    validatoAt: r.validato_at ? new Date(r.validato_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFotoRow(r: any): CampionaturaFoto {
  return { id: r.id, driveFileId: r.drive_file_id, nomeFile: r.nome_file, ordine: r.ordine };
}

export interface CampionatureFiltro {
  cliente?: string;
  esito?: EsitoCampionatura;
  cicloId?: string;
  codicePubblico?: string;
  soloAttive?: boolean;
}

export async function getCampionature(filtro: CampionatureFiltro = {}): Promise<Campionatura[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (filtro.soloAttive !== false) where.push(`attivo = true`);
  if (filtro.cliente) { where.push(`cliente = $${i++}`); values.push(filtro.cliente); }
  if (filtro.esito) { where.push(`esito = $${i++}`); values.push(filtro.esito); }
  if (filtro.cicloId) { where.push(`ciclo_id = $${i++}`); values.push(filtro.cicloId); }
  if (filtro.codicePubblico) { where.push(`codice_pubblico = $${i++}`); values.push(filtro.codicePubblico); }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await pool.query(`SELECT * FROM campionature ${whereClause} ORDER BY created_at DESC`, values);
  return rows.map(mapRow);
}

async function fetchConFoto(id: string, executor: Pool | PoolClient = pool): Promise<Campionatura> {
  const { rows } = await executor.query(`SELECT * FROM campionature WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`Campionatura non trovata: ${id}`);
  const campionatura = mapRow(rows[0]);
  const { rows: fotoRows } = await executor.query(`SELECT * FROM campionature_foto WHERE campionatura_id = $1 ORDER BY ordine NULLS LAST, created_at`, [id]);
  campionatura.foto = fotoRows.map(mapFotoRow);
  return campionatura;
}

export async function getCampionaturaById(id: string): Promise<Campionatura> {
  return fetchConFoto(id);
}

// Barcode non univoco per design (riuso intenzionale): ritorna tutte le righe con quel codice,
// più recente per prima — l'operatore in produzione sceglie/vede l'ultima per default.
export async function getCampionatureByCodicePubblico(codicePubblico: string): Promise<Campionatura[]> {
  const { rows } = await pool.query(
    `SELECT * FROM campionature WHERE codice_pubblico = $1 ORDER BY created_at DESC`,
    [codicePubblico]
  );
  return rows.map(mapRow);
}

export async function createCampionatura(data: {
  cicloId: string;
  cliente: string;
  codiceCampioneMaterialista?: string | null;
  dataCampionatura?: string | null;
  note?: string | null;
  forzaNuovoBarcode?: boolean;
}): Promise<Campionatura> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let codicePubblico: string | null = null;
    if (!data.forzaNuovoBarcode) {
      codicePubblico = await trovaCodicePubblicoRiusabile(data.cliente, data.cicloId, client);
    }
    if (!codicePubblico) {
      codicePubblico = await generaCodicePubblico(client, data.cliente);
    }

    const { rows } = await client.query(
      `INSERT INTO campionature (ciclo_id, cliente, codice_campione_materialista, codice_pubblico, data_campionatura, note)
       VALUES ($1,$2,$3,$4, COALESCE($5, CURRENT_DATE), $6)
       RETURNING id`,
      [data.cicloId, data.cliente, data.codiceCampioneMaterialista ?? null, codicePubblico, data.dataCampionatura ?? null, data.note ?? null]
    );
    const id = rows[0].id as string;
    await client.query("COMMIT");
    return fetchConFoto(id);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function updateCampionatura(
  id: string,
  data: { codiceCampioneMaterialista?: string | null; dataCampionatura?: string | null; note?: string | null }
): Promise<Campionatura> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (data.codiceCampioneMaterialista !== undefined) { sets.push(`codice_campione_materialista = $${i++}`); values.push(data.codiceCampioneMaterialista); }
  if (data.dataCampionatura !== undefined) { sets.push(`data_campionatura = $${i++}`); values.push(data.dataCampionatura); }
  if (data.note !== undefined) { sets.push(`note = $${i++}`); values.push(data.note); }
  if (sets.length === 0) return fetchConFoto(id);
  sets.push(`updated_at = now()`);
  values.push(id);
  const { rows } = await pool.query(`UPDATE campionature SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`, values);
  if (rows.length === 0) throw new Error(`Campionatura non trovata: ${id}`);
  return fetchConFoto(id);
}

export async function disattivaCampionatura(id: string): Promise<void> {
  await pool.query(`UPDATE campionature SET attivo = false, updated_at = now() WHERE id = $1`, [id]);
}

export async function setCampionaturaDriveFolderId(id: string, driveFolderId: string): Promise<void> {
  await pool.query(`UPDATE campionature SET drive_folder_id = $1, updated_at = now() WHERE id = $2`, [driveFolderId, id]);
}

export async function addFoto(campionaturaId: string, data: { driveFileId: string; nomeFile?: string | null; ordine?: number | null }): Promise<Campionatura> {
  await pool.query(
    `INSERT INTO campionature_foto (campionatura_id, drive_file_id, nome_file, ordine) VALUES ($1,$2,$3,$4)`,
    [campionaturaId, data.driveFileId, data.nomeFile ?? null, data.ordine ?? null]
  );
  return fetchConFoto(campionaturaId);
}

// Ritorna anche il drive_file_id rimosso, così il chiamante può cancellarlo anche da Drive.
export async function deleteFoto(campionaturaId: string, fotoId: string): Promise<{ driveFileId: string }> {
  const { rows } = await pool.query(
    `DELETE FROM campionature_foto WHERE id = $1 AND campionatura_id = $2 RETURNING drive_file_id`,
    [fotoId, campionaturaId]
  );
  if (rows.length === 0) throw new Error(`Foto non trovata: ${fotoId}`);
  return { driveFileId: rows[0].drive_file_id as string };
}

// Imposta l'esito della campionatura. Se 'approvato', nella STESSA transazione valida anche il
// ciclo collegato (warning non bloccanti TS/SDS, poi stato ciclo -> validato) — decisione
// esplicita: l'approvazione di una campionatura innesca automaticamente la validazione del ciclo.
export async function impostaEsito(
  id: string,
  esito: EsitoCampionatura
): Promise<{ campionatura: Campionatura; warningsCiclo: string[] }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(`SELECT * FROM campionature WHERE id = $1 FOR UPDATE`, [id]);
    if (rows.length === 0) throw new Error(`Campionatura non trovata: ${id}`);
    const campionatura = rows[0];

    const validatoAt = esito === "approvato" ? "now()" : "validato_at";
    await client.query(
      `UPDATE campionature SET esito = $1, validato_at = ${validatoAt}, updated_at = now() WHERE id = $2`,
      [esito, id]
    );

    let warningsCiclo: string[] = [];
    if (esito === "approvato") {
      warningsCiclo = await validaCicloInTransazione(client, campionatura.ciclo_id as string, id);
    }

    await client.query("COMMIT");
    return { campionatura: await fetchConFoto(id), warningsCiclo };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
