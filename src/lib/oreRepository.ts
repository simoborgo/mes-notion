import type { Pool, PoolClient } from "pg";
import { pool } from "./db";
import { aggiornaStandardRepartoPerOdp } from "./standardRepartoRepository";

export type OreCategoria = "COMMESSA" | "SETUP" | "MANUTENZIONE" | "RIUNIONE" | "FORMAZIONE" | "PULIZIE";
export type OreCausale = "P" | "T" | "M" | "C";

const COSTO_ORARIO = 41;

export interface OreRegistrata {
  id: string;
  data: string;
  matricola: string;
  cognome: string;
  nome: string;
  azienda: string | null;
  reparto: string | null;
  odp: string;
  categoria: OreCategoria;
  ore: number;
  rif: boolean;
  causale: OreCausale | null;
  note: string | null;
  costoRif: number | null;
  createdAt: string;
  updatedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): OreRegistrata {
  return {
    id: r.id,
    data: r.data instanceof Date ? r.data.toISOString().slice(0, 10) : r.data,
    matricola: r.matricola,
    cognome: r.cognome,
    nome: r.nome,
    azienda: r.azienda,
    reparto: r.reparto,
    odp: r.odp,
    categoria: r.categoria,
    ore: Number(r.ore),
    rif: r.rif,
    causale: r.causale,
    note: r.note,
    costoRif: r.costo_rif != null ? Number(r.costo_rif) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function categoriaFromOdp(odp: string): OreCategoria {
  const upper = odp.toUpperCase();
  if (upper.startsWith("SET")) return "SETUP";
  if (upper.startsWith("MNT")) return "MANUTENZIONE";
  if (upper.startsWith("MEET")) return "RIUNIONE";
  if (upper.startsWith("FORM")) return "FORMAZIONE";
  if (upper.startsWith("PUL")) return "PULIZIE";
  return "COMMESSA";
}

export async function getRegistrazioniPerData(data: string): Promise<OreRegistrata[]> {
  const { rows } = await pool.query(
    `SELECT * FROM ore_registrate WHERE data = $1 ORDER BY cognome, nome, odp`,
    [data]
  );
  return rows.map(mapRow);
}

export async function upsertRegistrazione(entry: {
  data: string;
  matricola: string;
  cognome: string;
  nome: string;
  azienda: string | null;
  reparto: string | null;
  odp: string;
  ore: number;
  rif: boolean;
  causale: OreCausale | null;
  note: string | null;
}): Promise<OreRegistrata> {
  const categoria = categoriaFromOdp(entry.odp);
  const costoRif = entry.rif ? Math.round(entry.ore * COSTO_ORARIO * 100) / 100 : null;
  const { rows } = await pool.query(
    `INSERT INTO ore_registrate (data, matricola, cognome, nome, azienda, reparto, odp, categoria, ore, rif, causale, note, costo_rif)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (data, matricola, odp) DO UPDATE SET
       cognome = EXCLUDED.cognome, nome = EXCLUDED.nome, azienda = EXCLUDED.azienda, reparto = EXCLUDED.reparto,
       categoria = EXCLUDED.categoria, ore = EXCLUDED.ore, rif = EXCLUDED.rif, causale = EXCLUDED.causale,
       note = EXCLUDED.note, costo_rif = EXCLUDED.costo_rif
     RETURNING *`,
    [entry.data, entry.matricola, entry.cognome, entry.nome, entry.azienda, entry.reparto,
     entry.odp, categoria, entry.ore, entry.rif, entry.causale, entry.note, costoRif]
  );
  void aggiornaStandardRepartoPerOdp(entry.odp);
  return mapRow(rows[0]);
}

// Upsert additivo — a differenza di upsertRegistrazione (che sostituisce il totale, uso del
// responsabile per correggere una voce) questa SOMMA oreDelta a quanto già presente per
// (data, matricola, odp). Usata dal flusso operatore/tablet, dove più segmenti di lavoro sullo
// stesso ODP nella stessa giornata devono accumularsi, non sovrascriversi. Accetta un client/pool
// esplicito per poter partecipare a una transazione (vedi segmentiOperatoreRepository.ts).
export async function aggiungiOreRegistrate(
  entry: {
    data: string;
    matricola: string;
    cognome: string;
    nome: string;
    azienda: string | null;
    reparto: string | null;
    odp: string;
    oreDelta: number;
    rif: boolean;
  },
  executor: Pool | PoolClient = pool
): Promise<OreRegistrata> {
  const categoria = categoriaFromOdp(entry.odp);
  const { rows } = await executor.query(
    `INSERT INTO ore_registrate (data, matricola, cognome, nome, azienda, reparto, odp, categoria, ore, rif, causale, note, costo_rif)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,NULL,$11)
     ON CONFLICT (data, matricola, odp) DO UPDATE SET
       cognome = EXCLUDED.cognome, nome = EXCLUDED.nome, azienda = EXCLUDED.azienda, reparto = EXCLUDED.reparto,
       categoria = EXCLUDED.categoria, ore = ore_registrate.ore + EXCLUDED.ore, rif = EXCLUDED.rif,
       causale = CASE WHEN EXCLUDED.rif THEN ore_registrate.causale ELSE NULL END,
       costo_rif = CASE WHEN EXCLUDED.rif THEN round((ore_registrate.ore + EXCLUDED.ore) * ${COSTO_ORARIO} * 100) / 100 ELSE NULL END
     RETURNING *`,
    [entry.data, entry.matricola, entry.cognome, entry.nome, entry.azienda, entry.reparto,
     entry.odp, categoria, entry.oreDelta, entry.rif, entry.rif ? Math.round(entry.oreDelta * COSTO_ORARIO * 100) / 100 : null]
  );
  return mapRow(rows[0]);
}

export async function deleteRegistrazione(id: string): Promise<boolean> {
  const { rows } = await pool.query(`DELETE FROM ore_registrate WHERE id = $1 RETURNING odp`, [id]);
  if (rows[0]) void aggiornaStandardRepartoPerOdp(rows[0].odp);
  return rows.length > 0;
}

export async function classificaCausale(id: string, causale: OreCausale): Promise<OreRegistrata> {
  const { rows } = await pool.query(
    `UPDATE ore_registrate SET causale = $2 WHERE id = $1 RETURNING *`,
    [id, causale]
  );
  return mapRow(rows[0]);
}

// Correzione manuale del reparto su una singola riga (operatori polivalenti, Fase 3a
// Gestione Ore avanzato) — sposta il conteggio ore verso il reparto corretto nella vista
// di oggi, dato che sez.oreRegistrate raggruppa per questo stesso campo.
export async function correggiReparto(id: string, reparto: string): Promise<OreRegistrata> {
  const { rows } = await pool.query(
    `UPDATE ore_registrate SET reparto = $2 WHERE id = $1 RETURNING *`,
    [id, reparto]
  );
  void aggiornaStandardRepartoPerOdp(rows[0].odp);
  return mapRow(rows[0]);
}

// ODP dominante di ciascun operatore nella data indicata (di norma il giorno prima di quello
// visualizzato) — usato per precompilare la selezione ODP. Query diretta su ore_registrate,
// non una cache denormalizzata: la vecchia tabella ultimo_odp veniva aggiornata ad ogni salvataggio
// indipendentemente dalla data della voce (anche correggendo una data passata), quindi poteva
// mostrare l'ODP di settimane prima come se fosse "di ieri" — bug reale, non solo un rischio.
// "Dominante" = più ore in quella data; a parità, la voce inserita per prima.
export async function getOdpGiornoPrecedenteMap(matricole: string[], dataPrecedente: string): Promise<Record<string, string>> {
  if (matricole.length === 0) return {};
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (matricola) matricola, odp
     FROM ore_registrate
     WHERE data = $1 AND matricola = ANY($2)
     ORDER BY matricola, ore DESC, created_at ASC`,
    [dataPrecedente, matricole]
  );
  const map: Record<string, string> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows.forEach((r: any) => { map[r.matricola] = r.odp; });
  return map;
}

export async function getRifacimentiDaClassificare(): Promise<OreRegistrata[]> {
  const { rows } = await pool.query(
    `SELECT * FROM ore_registrate WHERE rif = true AND causale IS NULL ORDER BY data DESC, cognome`
  );
  return rows.map(mapRow);
}

export async function getStoricoOdp(odp: string): Promise<OreRegistrata[]> {
  const { rows } = await pool.query(
    `SELECT * FROM ore_registrate WHERE odp = $1 ORDER BY data, cognome`,
    [odp]
  );
  return rows.map(mapRow);
}

export async function getStoricoOdps(odps: string[]): Promise<OreRegistrata[]> {
  if (odps.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT * FROM ore_registrate WHERE odp = ANY($1) ORDER BY data, cognome`,
    [odps]
  );
  return rows.map(mapRow);
}

export async function getStoricoOperatore(matricola: string, da?: string, a?: string): Promise<OreRegistrata[]> {
  const conditions = ["matricola = $1"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any[] = [matricola];
  if (da) { params.push(da); conditions.push(`data >= $${params.length}`); }
  if (a) { params.push(a); conditions.push(`data <= $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT * FROM ore_registrate WHERE ${conditions.join(" AND ")} ORDER BY data DESC`,
    params
  );
  return rows.map(mapRow);
}

export interface KpiTotali {
  oreTotali: number;
  oreValore: number;
  oreRifacimento: number;
  percRifacimento: number;
  costoTotale: number;
  costoRifacimento: number;
}

export async function getKpiTotali(da: string, a: string): Promise<KpiTotali> {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(ore),0) AS ore_totali,
       COALESCE(SUM(ore) FILTER (WHERE NOT rif),0) AS ore_valore,
       COALESCE(SUM(ore) FILTER (WHERE rif),0) AS ore_rifacimento,
       COALESCE(SUM(ore) * $3,0) AS costo_totale,
       COALESCE(SUM(ore) FILTER (WHERE rif) * $3,0) AS costo_rifacimento
     FROM ore_registrate WHERE data BETWEEN $1 AND $2`,
    [da, a, COSTO_ORARIO]
  );
  const r = rows[0];
  const oreTotali = Number(r.ore_totali);
  const oreRifacimento = Number(r.ore_rifacimento);
  return {
    oreTotali,
    oreValore: Number(r.ore_valore),
    oreRifacimento,
    percRifacimento: oreTotali > 0 ? (oreRifacimento / oreTotali) * 100 : 0,
    costoTotale: Number(r.costo_totale),
    costoRifacimento: Number(r.costo_rifacimento),
  };
}

export interface KpiPerOdp {
  odp: string;
  oreTotali: number;
  oreRifacimento: number;
  percRifacimento: number;
  costo: number;
}

export async function getKpiPerOdp(da: string, a: string): Promise<KpiPerOdp[]> {
  const { rows } = await pool.query(
    `SELECT odp,
       SUM(ore) AS ore_totali,
       SUM(ore) FILTER (WHERE rif) AS ore_rifacimento,
       SUM(ore) * $3 AS costo
     FROM ore_registrate WHERE data BETWEEN $1 AND $2 AND categoria = 'COMMESSA'
     GROUP BY odp ORDER BY ore_totali DESC`,
    [da, a, COSTO_ORARIO]
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => {
    const oreTotali = Number(r.ore_totali);
    const oreRifacimento = Number(r.ore_rifacimento ?? 0);
    return { odp: r.odp, oreTotali, oreRifacimento, percRifacimento: oreTotali > 0 ? (oreRifacimento / oreTotali) * 100 : 0, costo: Number(r.costo) };
  });
}

export interface KpiPerOperatore {
  matricola: string;
  cognome: string;
  nome: string;
  oreTotali: number;
  giorniLavorati: number;
}

export async function getKpiPerOperatore(da: string, a: string): Promise<KpiPerOperatore[]> {
  const { rows } = await pool.query(
    `SELECT matricola, MAX(cognome) AS cognome, MAX(nome) AS nome,
       SUM(ore) AS ore_totali, COUNT(DISTINCT data) AS giorni_lavorati
     FROM ore_registrate WHERE data BETWEEN $1 AND $2
     GROUP BY matricola ORDER BY cognome`,
    [da, a]
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    matricola: r.matricola, cognome: r.cognome, nome: r.nome,
    oreTotali: Number(r.ore_totali), giorniLavorati: Number(r.giorni_lavorati),
  }));
}

export interface KpiPerCausale {
  causale: string;
  ore: number;
  perc: number;
  costo: number;
}

export async function getKpiPerCausale(da: string, a: string): Promise<KpiPerCausale[]> {
  const { rows } = await pool.query(
    `SELECT COALESCE(causale,'Non classificato') AS causale, SUM(ore) AS ore, SUM(ore) * $3 AS costo
     FROM ore_registrate WHERE data BETWEEN $1 AND $2 AND rif = true
     GROUP BY causale ORDER BY ore DESC`,
    [da, a, COSTO_ORARIO]
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totale = rows.reduce((s: number, r: any) => s + Number(r.ore), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    causale: r.causale, ore: Number(r.ore),
    perc: totale > 0 ? (Number(r.ore) / totale) * 100 : 0, costo: Number(r.costo),
  }));
}

export interface KpiPerReparto {
  reparto: string;
  oreTotali: number;
  oreRifacimento: number;
  percRifacimento: number;
}

export async function getKpiPerReparto(da: string, a: string): Promise<KpiPerReparto[]> {
  const { rows } = await pool.query(
    `SELECT COALESCE(reparto,'Non specificato') AS reparto,
       SUM(ore) AS ore_totali, SUM(ore) FILTER (WHERE rif) AS ore_rifacimento
     FROM ore_registrate WHERE data BETWEEN $1 AND $2
     GROUP BY reparto ORDER BY reparto`,
    [da, a]
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => {
    const oreTotali = Number(r.ore_totali);
    const oreRifacimento = Number(r.ore_rifacimento ?? 0);
    return { reparto: r.reparto, oreTotali, oreRifacimento, percRifacimento: oreTotali > 0 ? (oreRifacimento / oreTotali) * 100 : 0 };
  });
}

export async function getTop5OdpRifacimento(da: string, a: string): Promise<{ odp: string; oreRifacimento: number }[]> {
  const { rows } = await pool.query(
    `SELECT odp, SUM(ore) AS ore_rifacimento FROM ore_registrate
     WHERE data BETWEEN $1 AND $2 AND rif = true
     GROUP BY odp ORDER BY ore_rifacimento DESC LIMIT 5`,
    [da, a]
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({ odp: r.odp, oreRifacimento: Number(r.ore_rifacimento) }));
}
