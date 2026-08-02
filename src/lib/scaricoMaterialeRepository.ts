import { pool } from "./db";

export interface ScaricoMateriale {
  id: string;
  operatore: string;
  schedaId: string | null;
  odpLabel: string | null;
  descrizione: string;
  creatoIl: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): ScaricoMateriale {
  return {
    id: r.id,
    operatore: r.operatore,
    schedaId: r.scheda_id,
    odpLabel: r.odp_label,
    descrizione: r.descrizione,
    creatoIl: r.creato_il,
  };
}

export async function creaScaricoMateriale(entry: {
  operatore: string;
  schedaId: string | null;
  odpLabel: string | null;
  descrizione: string;
}): Promise<ScaricoMateriale> {
  const { rows } = await pool.query(
    `INSERT INTO scarichi_materiale (operatore, scheda_id, odp_label, descrizione)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [entry.operatore, entry.schedaId, entry.odpLabel, entry.descrizione]
  );
  return mapRow(rows[0]);
}
