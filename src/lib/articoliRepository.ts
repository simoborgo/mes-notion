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

export interface ArticoloConPattern extends Articolo {
  patternId: string | null;
  patternNome: string | null;
  programmaCncDisponibile: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRowConPattern(r: any): ArticoloConPattern {
  return {
    ...mapRow(r),
    patternId: r.pattern_id,
    patternNome: r.pattern_nome,
    programmaCncDisponibile: r.programma_cnc_disponibile,
  };
}

// Per la pagina admin di assegnazione Pattern_Ciclo (Fase 2 APS) — elenco completo, non solo
// gli articoli già apparsi in una Scheda/Offerta.
export async function getArticoliConPattern(): Promise<ArticoloConPattern[]> {
  const { rows } = await pool.query(
    `SELECT a.*, pc.nome AS pattern_nome
     FROM articoli a LEFT JOIN pattern_ciclo pc ON pc.id = a.pattern_id
     ORDER BY a.descrizione`
  );
  return rows.map(mapRowConPattern);
}

export async function aggiornaPatternArticolo(codiceArticolo: string, patternId: string | null): Promise<ArticoloConPattern | null> {
  const { rows } = await pool.query(
    `UPDATE articoli SET pattern_id = $2 WHERE codice_articolo = $1
     RETURNING *, (SELECT nome FROM pattern_ciclo WHERE id = $2) AS pattern_nome`,
    [codiceArticolo, patternId]
  );
  return rows[0] ? mapRowConPattern(rows[0]) : null;
}

export async function getArticoli(): Promise<Articolo[]> {
  const { rows } = await pool.query(`SELECT * FROM articoli ORDER BY descrizione`);
  return rows.map(mapRow);
}

export async function getArticoloByCodice(codiceArticolo: string): Promise<Articolo | null> {
  const { rows } = await pool.query(`SELECT * FROM articoli WHERE codice_articolo = $1`, [codiceArticolo]);
  return rows[0] ? mapRow(rows[0]) : null;
}

// `articoli` nasce da un import una tantum (CSV storico "Codici Valorizzati", 2026-08-04) e non
// cresce da sola — un codice articolo di una commessa nuova, o mai censita prima, semplicemente
// non c'è. Chiamata da chi ha bisogno che il codice esista per rispettare la FK (registrazione
// ore -> standard_reparto, aggiunta riga Offerta) invece di bloccare/scartare in silenzio: crea
// una riga minima (descrizione = codice stesso, nessuna categoria) SOLO se non esiste già — non
// tocca mai una riga già presente, per non sovrascrivere una descrizione sistemata a mano dopo.
export async function ensureArticoloEsiste(codiceArticolo: string): Promise<void> {
  await pool.query(
    `INSERT INTO articoli (codice_articolo, descrizione) VALUES ($1, $1) ON CONFLICT (codice_articolo) DO NOTHING`,
    [codiceArticolo]
  );
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
