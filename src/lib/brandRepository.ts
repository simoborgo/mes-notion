import { pool } from "./db";
import type { Brand } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): Brand {
  return { id: r.id, nome: r.nome, alias: r.alias, haLogo: !!r.ha_logo };
}

export async function getBrand(): Promise<Brand[]> {
  const { rows } = await pool.query(`SELECT id, nome, alias, (logo IS NOT NULL) AS ha_logo FROM brand ORDER BY lower(nome)`);
  return rows.map(mapRow);
}

export async function createBrand(data: { nome: string; alias: string }): Promise<Brand> {
  const { rows } = await pool.query(
    `INSERT INTO brand (nome, alias) VALUES ($1, $2) RETURNING id, nome, alias, false AS ha_logo`,
    [data.nome, data.alias],
  );
  return mapRow(rows[0]);
}

export async function updateBrand(id: string, data: { nome: string; alias: string }): Promise<Brand | null> {
  const { rows } = await pool.query(
    `UPDATE brand SET nome = $1, alias = $2, aggiornato_il = now() WHERE id = $3
     RETURNING id, nome, alias, (logo IS NOT NULL) AS ha_logo`,
    [data.nome, data.alias, id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deleteBrand(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM brand WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function setLogoBrand(id: string, logo: Buffer | null, mime: string | null): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE brand SET logo = $1, logo_mime = $2, aggiornato_il = now() WHERE id = $3`,
    [logo, mime, id],
  );
  return (rowCount ?? 0) > 0;
}

export async function getLogoBrand(id: string): Promise<{ logo: Buffer; mime: string } | null> {
  const { rows } = await pool.query(`SELECT logo, logo_mime FROM brand WHERE id = $1 AND logo IS NOT NULL`, [id]);
  return rows[0] ? { logo: rows[0].logo, mime: rows[0].logo_mime } : null;
}

// Logo del brand di una commessa come data URI (per le stampe, dove puppeteer non ha la sessione).
export async function getLogoDataUriByCommessa(commessaId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT b.logo, b.logo_mime FROM commesse c JOIN brand b ON b.id = c.brand_id WHERE c.id = $1 AND b.logo IS NOT NULL`,
    [commessaId],
  );
  if (!rows[0]) return null;
  return `data:${rows[0].logo_mime};base64,${(rows[0].logo as Buffer).toString("base64")}`;
}
