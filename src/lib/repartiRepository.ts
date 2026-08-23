import { pool } from "./db";

export type TipoCapacitaReparto = "corsie" | "monte_ore";

export interface Reparto {
  id: string;
  nome: string;
  tipoCapacita: TipoCapacitaReparto;
  capacitaSett: number | null;
  nRisorseParallele: number | null;
  wipMax: number | null;
  tamburo: boolean;
  ordinePipeline: number;
  tbd: boolean;
  aggiornatoIl: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): Reparto {
  return {
    id: r.id,
    nome: r.nome,
    tipoCapacita: r.tipo_capacita,
    capacitaSett: r.capacita_sett != null ? Number(r.capacita_sett) : null,
    nRisorseParallele: r.n_risorse_parallele != null ? Number(r.n_risorse_parallele) : null,
    wipMax: r.wip_max != null ? Number(r.wip_max) : null,
    tamburo: r.tamburo,
    ordinePipeline: Number(r.ordine_pipeline),
    tbd: r.tbd,
    aggiornatoIl: r.aggiornato_il,
  };
}

export async function getReparti(): Promise<Reparto[]> {
  const { rows } = await pool.query(`SELECT * FROM reparti ORDER BY ordine_pipeline`);
  return rows.map(mapRow);
}

export async function aggiornaReparto(id: string, entry: {
  nome: string;
  ordinePipeline: number;
  capacitaSett: number | null;
  nRisorseParallele: number | null;
  wipMax: number | null;
  tamburo: boolean;
  tbd: boolean;
}): Promise<Reparto | null> {
  const { rows } = await pool.query(
    `UPDATE reparti SET
       nome = $2, ordine_pipeline = $3, capacita_sett = $4, n_risorse_parallele = $5, wip_max = $6,
       tamburo = $7, tbd = $8, aggiornato_il = now()
     WHERE id = $1 RETURNING *`,
    [id, entry.nome, entry.ordinePipeline, entry.capacitaSett, entry.nRisorseParallele, entry.wipMax, entry.tamburo, entry.tbd]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}
