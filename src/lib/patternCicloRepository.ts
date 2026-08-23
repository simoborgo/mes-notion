import { pool } from "./db";

export interface PatternCiclo {
  id: string;
  nome: string;
  attivo: boolean;
  nFasi: number;
  nArticoli: number;
}

export interface PatternCicloFase {
  id: string;
  patternId: string;
  repartoId: string;
  repartoNome: string;
  ordine: number;
  sottoFase: string | null;
  condizionale: boolean;
  condizione: string | null;
  parallellizzabile: boolean;
  tempoAttrezzaggioOre: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPattern(r: any): PatternCiclo {
  return {
    id: r.id,
    nome: r.nome,
    attivo: r.attivo,
    nFasi: Number(r.n_fasi ?? 0),
    nArticoli: Number(r.n_articoli ?? 0),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFase(r: any): PatternCicloFase {
  return {
    id: r.id,
    patternId: r.pattern_id,
    repartoId: r.reparto_id,
    repartoNome: r.reparto_nome,
    ordine: Number(r.ordine),
    sottoFase: r.sotto_fase,
    condizionale: r.condizionale,
    condizione: r.condizione,
    parallellizzabile: r.parallellizzabile,
    tempoAttrezzaggioOre: r.tempo_attrezzaggio_ore != null ? Number(r.tempo_attrezzaggio_ore) : null,
  };
}

// Tutti i pattern (anche disattivati) — usata dalla pagina admin di gestione.
export async function getPatternCiclo(): Promise<PatternCiclo[]> {
  const { rows } = await pool.query(`
    SELECT pc.*,
      (SELECT count(*) FROM pattern_ciclo_fasi WHERE pattern_id = pc.id) AS n_fasi,
      (SELECT count(*) FROM articoli WHERE pattern_id = pc.id) AS n_articoli
    FROM pattern_ciclo pc ORDER BY pc.nome
  `);
  return rows.map(mapPattern);
}

// Solo i pattern attivi — usata dal selettore in Scheda (SchedaFasiApsTab.tsx via
// /api/pattern-ciclo): un pattern disattivato non deve più essere scelto per nuove fasi.
export async function getPatternCicloAttivi(): Promise<PatternCiclo[]> {
  const { rows } = await pool.query(`
    SELECT pc.*,
      (SELECT count(*) FROM pattern_ciclo_fasi WHERE pattern_id = pc.id) AS n_fasi,
      (SELECT count(*) FROM articoli WHERE pattern_id = pc.id) AS n_articoli
    FROM pattern_ciclo pc WHERE attivo = true ORDER BY pc.nome
  `);
  return rows.map(mapPattern);
}

export async function getPatternCicloById(id: string): Promise<PatternCiclo | null> {
  const { rows } = await pool.query(`
    SELECT pc.*,
      (SELECT count(*) FROM pattern_ciclo_fasi WHERE pattern_id = pc.id) AS n_fasi,
      (SELECT count(*) FROM articoli WHERE pattern_id = pc.id) AS n_articoli
    FROM pattern_ciclo pc WHERE pc.id = $1
  `, [id]);
  return rows[0] ? mapPattern(rows[0]) : null;
}

export async function creaPattern(nome: string): Promise<PatternCiclo> {
  const { rows } = await pool.query(
    `INSERT INTO pattern_ciclo (nome) VALUES ($1) RETURNING *, 0 AS n_fasi, 0 AS n_articoli`,
    [nome]
  );
  return mapPattern(rows[0]);
}

export async function aggiornaPattern(id: string, entry: { nome: string; attivo: boolean }): Promise<PatternCiclo | null> {
  const { rows } = await pool.query(
    `UPDATE pattern_ciclo SET nome = $2, attivo = $3 WHERE id = $1
     RETURNING *,
       (SELECT count(*) FROM pattern_ciclo_fasi WHERE pattern_id = $1) AS n_fasi,
       (SELECT count(*) FROM articoli WHERE pattern_id = $1) AS n_articoli`,
    [id, entry.nome, entry.attivo]
  );
  return rows[0] ? mapPattern(rows[0]) : null;
}

export async function getFasiPattern(patternId: string): Promise<PatternCicloFase[]> {
  const { rows } = await pool.query(
    `SELECT pcf.*, r.nome AS reparto_nome
     FROM pattern_ciclo_fasi pcf JOIN reparti r ON r.id = pcf.reparto_id
     WHERE pcf.pattern_id = $1 ORDER BY pcf.ordine`,
    [patternId]
  );
  return rows.map(mapFase);
}

interface DatiFasePattern {
  repartoId: string;
  ordine: number;
  sottoFase: string | null;
  condizionale: boolean;
  condizione: string | null;
  parallellizzabile: boolean;
  tempoAttrezzaggioOre: number | null;
}

export async function creaFasePattern(patternId: string, dati: DatiFasePattern): Promise<PatternCicloFase> {
  const { rows } = await pool.query(
    `INSERT INTO pattern_ciclo_fasi (pattern_id, reparto_id, ordine, sotto_fase, condizionale, condizione, parallellizzabile, tempo_attrezzaggio_ore)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *, (SELECT nome FROM reparti WHERE id = $2) AS reparto_nome`,
    [patternId, dati.repartoId, dati.ordine, dati.sottoFase, dati.condizionale, dati.condizione, dati.parallellizzabile, dati.tempoAttrezzaggioOre]
  );
  return mapFase(rows[0]);
}

export async function aggiornaFasePattern(faseId: string, dati: DatiFasePattern): Promise<PatternCicloFase | null> {
  const { rows } = await pool.query(
    `UPDATE pattern_ciclo_fasi SET
       reparto_id = $2, ordine = $3, sotto_fase = $4, condizionale = $5, condizione = $6,
       parallellizzabile = $7, tempo_attrezzaggio_ore = $8
     WHERE id = $1
     RETURNING *, (SELECT nome FROM reparti WHERE id = $2) AS reparto_nome`,
    [faseId, dati.repartoId, dati.ordine, dati.sottoFase, dati.condizionale, dati.condizione, dati.parallellizzabile, dati.tempoAttrezzaggioOre]
  );
  return rows[0] ? mapFase(rows[0]) : null;
}

// Elimina una fase del pattern. Se è già stata usata per generare schede_fasi di un ODP reale,
// la FK (senza cascade) blocca la DELETE — la intercettiamo e la trattiamo come esito normale
// (inUso: true) invece di far propagare l'errore Postgres grezzo fino alla UI.
export async function eliminaFasePattern(faseId: string): Promise<{ ok: boolean; inUso?: boolean }> {
  try {
    const { rowCount } = await pool.query(`DELETE FROM pattern_ciclo_fasi WHERE id = $1`, [faseId]);
    return { ok: (rowCount ?? 0) > 0 };
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "23503") {
      return { ok: false, inUso: true };
    }
    throw e;
  }
}
