import { pool, dateToStr } from "./db";
import type { Area, AreaUpdate } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): Area {
  return {
    id: r.id,
    nomeArredo: r.nome_arredo,
    codiceArticoloA: r.codice_articolo_a,
    commessaId: r.commessa_id,
    dataConsegnaPrevista: r.data_consegna_prevista ? dateToStr(r.data_consegna_prevista) : null,
    descrizione: r.descrizione,
    localitaCliente: r.localita_cliente ?? "",
    note: r.note,
    posizione: r.posizione,
    quantita: r.quantita != null ? Number(r.quantita) : null,
    statoCommessa: r.stato_commessa ?? "",
    statoProduzione: r.stato_produzione,
    notionUrl: "",
  };
}

// localita_cliente/stato_commessa: derivati via JOIN dalla Commessa collegata, mai duplicati.
const SELECT = `
  SELECT a.*, c.localita AS localita_cliente, c.stato AS stato_commessa
  FROM aree a
  JOIN commesse c ON c.id = a.commessa_id
`;

export async function getAreeByCommessa(commessaId: string): Promise<Area[]> {
  const { rows } = await pool.query(`${SELECT} WHERE a.commessa_id = $1 ORDER BY a.nome_arredo`, [commessaId]);
  return rows.map(mapRow);
}

export async function createArea(data: {
  commessaId: string;
  nomeArredo?: string;
  codiceArticoloA?: string;
  dataConsegnaPrevista?: string | null;
  descrizione?: string;
  note?: string;
  posizione?: string;
  quantita?: number | null;
  statoProduzione?: string;
}): Promise<Area> {
  const { rows } = await pool.query(
    `INSERT INTO aree (id, commessa_id, nome_arredo, codice_articolo_a, data_consegna_prevista, descrizione, note, posizione, quantita, stato_produzione)
     VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      data.commessaId,
      data.nomeArredo ?? "",
      data.codiceArticoloA ?? "",
      data.dataConsegnaPrevista ?? null,
      data.descrizione ?? "",
      data.note ?? "",
      data.posizione ?? "",
      data.quantita ?? null,
      data.statoProduzione ?? "",
    ],
  );
  const { rows: fresh } = await pool.query(`${SELECT} WHERE a.id = $1`, [rows[0].id]);
  return mapRow(fresh[0]);
}

export async function updateArea(id: string, data: AreaUpdate): Promise<Area> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (data.nomeArredo !== undefined) { sets.push(`nome_arredo = $${i++}`); values.push(data.nomeArredo); }
  if (data.codiceArticoloA !== undefined) { sets.push(`codice_articolo_a = $${i++}`); values.push(data.codiceArticoloA); }
  if (data.commessaId !== undefined) { sets.push(`commessa_id = $${i++}`); values.push(data.commessaId); }
  if (data.dataConsegnaPrevista !== undefined) { sets.push(`data_consegna_prevista = $${i++}`); values.push(data.dataConsegnaPrevista); }
  if (data.descrizione !== undefined) { sets.push(`descrizione = $${i++}`); values.push(data.descrizione); }
  if (data.note !== undefined) { sets.push(`note = $${i++}`); values.push(data.note); }
  if (data.posizione !== undefined) { sets.push(`posizione = $${i++}`); values.push(data.posizione); }
  if (data.quantita !== undefined) { sets.push(`quantita = $${i++}`); values.push(data.quantita); }
  if (data.statoProduzione !== undefined) { sets.push(`stato_produzione = $${i++}`); values.push(data.statoProduzione); }
  sets.push(`aggiornato_il = now()`);

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE aree SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`,
    values,
  );
  if (rows.length === 0) throw new Error(`Area non trovata: ${id}`);
  const { rows: fresh } = await pool.query(`${SELECT} WHERE a.id = $1`, [rows[0].id]);
  return mapRow(fresh[0]);
}
