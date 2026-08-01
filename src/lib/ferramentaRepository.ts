import { pool } from "./db";

export type MovimentoTipo = "scarico_kanban" | "scarico_a_pezzo" | "carico" | "rettifica";
export type MovimentoFonte = "mes" | "webhook_notion" | "wurth";

export interface MovimentoFerramenta {
  id: string;
  articoloId: string;
  codiceOs1: string | null;
  tipo: MovimentoTipo;
  quantita: number;
  giacenzaPrecedente: number;
  giacenzaRisultante: number;
  operatore: string;
  fonte: MovimentoFonte;
  note: string | null;
  odpId: string | null;
  odpLabel: string | null;
  creatoIl: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): MovimentoFerramenta {
  return {
    id: r.id,
    articoloId: r.articolo_id,
    codiceOs1: r.codice_os1,
    tipo: r.tipo,
    quantita: Number(r.quantita),
    giacenzaPrecedente: Number(r.giacenza_precedente),
    giacenzaRisultante: Number(r.giacenza_risultante),
    operatore: r.operatore,
    fonte: r.fonte,
    note: r.note,
    odpId: r.odp_id,
    odpLabel: r.odp_label,
    creatoIl: r.creato_il,
  };
}

export async function registraMovimento(entry: {
  articoloId: string;
  codiceOs1: string | null;
  tipo: MovimentoTipo;
  quantita: number;
  giacenzaPrecedente: number;
  giacenzaRisultante: number;
  operatore: string;
  fonte: MovimentoFonte;
  note?: string | null;
  odpId?: string | null;
  odpLabel?: string | null;
}): Promise<MovimentoFerramenta> {
  const { rows } = await pool.query(
    `INSERT INTO movimenti_ferramenta (articolo_id, codice_os1, tipo, quantita, giacenza_precedente, giacenza_risultante, operatore, fonte, note, odp_id, odp_label)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [entry.articoloId, entry.codiceOs1, entry.tipo, entry.quantita, entry.giacenzaPrecedente, entry.giacenzaRisultante, entry.operatore, entry.fonte, entry.note ?? null, entry.odpId ?? null, entry.odpLabel ?? null]
  );
  return mapRow(rows[0]);
}

export async function getMovimentiByArticolo(articoloId: string, limit = 50): Promise<MovimentoFerramenta[]> {
  const { rows } = await pool.query(
    `SELECT * FROM movimenti_ferramenta WHERE articolo_id = $1 ORDER BY creato_il DESC LIMIT $2`,
    [articoloId, limit]
  );
  return rows.map(mapRow);
}

export async function getMovimentiByOdp(odpId: string, limit = 200): Promise<MovimentoFerramenta[]> {
  const { rows } = await pool.query(
    `SELECT * FROM movimenti_ferramenta WHERE odp_id = $1 ORDER BY creato_il DESC LIMIT $2`,
    [odpId, limit]
  );
  return rows.map(mapRow);
}

// Set di odp_id che hanno almeno un movimento registrato — usato dalla vista "fogli mancanti"
export async function getOdpConMovimenti(): Promise<Set<string>> {
  const { rows } = await pool.query(
    `SELECT DISTINCT odp_id FROM movimenti_ferramenta WHERE odp_id IS NOT NULL`
  );
  return new Set(rows.map(r => r.odp_id as string));
}
