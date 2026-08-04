import { pool } from "./db";

export interface Articolo {
  codiceArticolo: string;
  descrizione: string;
  categoria: string | null;
  creatoIl: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): Articolo {
  return {
    codiceArticolo: r.codice_articolo,
    descrizione: r.descrizione,
    categoria: r.categoria,
    creatoIl: r.creato_il,
  };
}

export async function getArticoli(): Promise<Articolo[]> {
  const { rows } = await pool.query(`SELECT * FROM articoli ORDER BY descrizione`);
  return rows.map(mapRow);
}

export async function getArticoloByCodice(codiceArticolo: string): Promise<Articolo | null> {
  const { rows } = await pool.query(`SELECT * FROM articoli WHERE codice_articolo = $1`, [codiceArticolo]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertArticolo(entry: { codiceArticolo: string; descrizione: string; categoria: string | null }): Promise<Articolo> {
  const { rows } = await pool.query(
    `INSERT INTO articoli (codice_articolo, descrizione, categoria) VALUES ($1, $2, $3)
     ON CONFLICT (codice_articolo) DO UPDATE SET descrizione = EXCLUDED.descrizione, categoria = EXCLUDED.categoria
     RETURNING *`,
    [entry.codiceArticolo, entry.descrizione, entry.categoria]
  );
  return mapRow(rows[0]);
}

export interface OperatoreRepartoSecondario {
  matricola: string;
  repartoSecondario: string;
  percentuale: number;
}

export async function getRepartiSecondari(): Promise<Map<string, OperatoreRepartoSecondario>> {
  const { rows } = await pool.query(`SELECT * FROM operatori_reparto_secondario`);
  const map = new Map<string, OperatoreRepartoSecondario>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows.forEach((r: any) => {
    map.set(r.matricola, { matricola: r.matricola, repartoSecondario: r.reparto_secondario, percentuale: Number(r.percentuale) });
  });
  return map;
}
