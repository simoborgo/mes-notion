import { pool } from "./db";

export interface ParametriReparto {
  reparto: string;
  nPersone: number;
  oreGiorno: number;
  pctStraordinariMax: number;
  margineSicurezzaEsterni: number;
  tariffaEsternaEurH: number | null;
  oreGiornoEsterno: number | null;
  aggiornatoIl: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): ParametriReparto {
  return {
    reparto: r.reparto,
    nPersone: r.n_persone,
    oreGiorno: Number(r.ore_giorno),
    pctStraordinariMax: Number(r.pct_straordinari_max),
    margineSicurezzaEsterni: Number(r.margine_sicurezza_esterni),
    tariffaEsternaEurH: r.tariffa_esterna_eur_h != null ? Number(r.tariffa_esterna_eur_h) : null,
    oreGiornoEsterno: r.ore_giorno_esterno != null ? Number(r.ore_giorno_esterno) : null,
    aggiornatoIl: r.aggiornato_il,
  };
}

export async function getParametriReparto(): Promise<ParametriReparto[]> {
  const { rows } = await pool.query(`SELECT * FROM parametri_reparto ORDER BY reparto`);
  return rows.map(mapRow);
}

export async function aggiornaParametriReparto(reparto: string, entry: {
  nPersone: number;
  oreGiorno: number;
  pctStraordinariMax: number;
  margineSicurezzaEsterni: number;
  tariffaEsternaEurH: number | null;
  oreGiornoEsterno: number | null;
}): Promise<ParametriReparto | null> {
  const { rows } = await pool.query(
    `UPDATE parametri_reparto SET
       n_persone = $2, ore_giorno = $3, pct_straordinari_max = $4, margine_sicurezza_esterni = $5,
       tariffa_esterna_eur_h = $6, ore_giorno_esterno = $7, aggiornato_il = now()
     WHERE reparto = $1 RETURNING *`,
    [reparto, entry.nPersone, entry.oreGiorno, entry.pctStraordinariMax, entry.margineSicurezzaEsterni,
     entry.tariffaEsternaEurH, entry.oreGiornoEsterno]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}
