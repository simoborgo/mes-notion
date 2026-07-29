import { pool } from "./db";
import { getFornitoriMap } from "./notion";
import type { ArticoloFerramenta, ArticoloFerramentaUpdate } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): ArticoloFerramenta {
  return {
    id: r.id,
    descrizione: r.descrizione,
    codiceOs1: r.codice_os1,
    unitaMisura: r.unita_misura,
    fornitoreId: r.fornitore_id,
    fornitoreNome: r.fornitore_nome,
    fornitoreNomeOs1: r.fornitore_nome_os1,
    codiceFornitore: r.codice_fornitore,
    metodoGestione: r.metodo_gestione,
    giacenzaAttuale: Number(r.giacenza_attuale),
    quantitaStandardVaschetta: r.quantita_standard_vaschetta != null ? Number(r.quantita_standard_vaschetta) : null,
    sogliaMinima: r.soglia_minima != null ? Number(r.soglia_minima) : null,
    attivo: r.attivo,
    note: r.note,
    ubicazione: r.ubicazione ?? "",
    notionUrl: "", // nessuna pagina Notion per l'articolo: anagrafica migrata a Postgres
  };
}

export async function getArticoliFerramenta(): Promise<ArticoloFerramenta[]> {
  const { rows } = await pool.query(`SELECT * FROM articoli_ferramenta ORDER BY descrizione`);
  return rows.map(mapRow);
}

export async function getArticoloFerramentaById(id: string): Promise<ArticoloFerramenta> {
  const { rows } = await pool.query(`SELECT * FROM articoli_ferramenta WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`Articolo Ferramenta non trovato: ${id}`);
  return mapRow(rows[0]);
}

// Set dei codici OS1 già presenti — usato dal dedup dell'import CSV (sostituisce il
// fetch dell'intero catalogo che serviva solo a costruire lo stesso Set su Notion).
export async function getCodiciOs1Esistenti(): Promise<Set<string>> {
  const { rows } = await pool.query(`SELECT codice_os1 FROM articoli_ferramenta`);
  return new Set(rows.map((r) => r.codice_os1 as string));
}

export async function createArticoloFerramenta({
  descrizione,
  codiceOs1,
  unitaMisura,
  fornitoreId,
  fornitoreNomeOs1,
  codiceFornitore,
}: {
  descrizione: string;
  codiceOs1: string;
  unitaMisura: string;
  fornitoreId?: string | null;
  fornitoreNomeOs1?: string | null;
  codiceFornitore?: string | null;
}): Promise<ArticoloFerramenta> {
  // Il nome fornitore si risolve UNA VOLTA, in scrittura, da Fornitori (Notion, già in cache) —
  // nessun percorso di lettura tocca mai Notion per la Ferramenta.
  let fornitoreNome = "";
  if (fornitoreId) {
    const map = await getFornitoriMap();
    fornitoreNome = map[fornitoreId] ?? "";
  }

  const { rows } = await pool.query(
    `INSERT INTO articoli_ferramenta
       (id, codice_os1, descrizione, unita_misura, fornitore_id, fornitore_nome, fornitore_nome_os1, codice_fornitore, giacenza_attuale, attivo)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 0, true)
     RETURNING *`,
    [
      codiceOs1,
      descrizione || codiceOs1,
      unitaMisura || "",
      fornitoreId ?? null,
      fornitoreNome,
      fornitoreNomeOs1 ?? "",
      codiceFornitore ?? "",
    ],
  );
  return mapRow(rows[0]);
}

export async function updateArticoloFerramentaClassificazione(id: string, data: ArticoloFerramentaUpdate): Promise<ArticoloFerramenta> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (data.metodoGestione !== undefined) { sets.push(`metodo_gestione = $${i++}`); values.push(data.metodoGestione); }
  if (data.quantitaStandardVaschetta !== undefined) { sets.push(`quantita_standard_vaschetta = $${i++}`); values.push(data.quantitaStandardVaschetta); }
  if (data.sogliaMinima !== undefined) { sets.push(`soglia_minima = $${i++}`); values.push(data.sogliaMinima); }
  if (data.attivo !== undefined) { sets.push(`attivo = $${i++}`); values.push(data.attivo); }
  if (data.note !== undefined) { sets.push(`note = $${i++}`); values.push(data.note); }
  if (data.ubicazione !== undefined) { sets.push(`ubicazione = $${i++}`); values.push(data.ubicazione); }
  if (data.codiceFornitore !== undefined) { sets.push(`codice_fornitore = $${i++}`); values.push(data.codiceFornitore ?? ""); }
  sets.push(`aggiornato_il = now()`);

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE articoli_ferramenta SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values,
  );
  if (rows.length === 0) throw new Error(`Articolo Ferramenta non trovato: ${id}`);
  return mapRow(rows[0]);
}

export async function updateArticoloFerramentaGiacenza(id: string, giacenzaAttuale: number): Promise<void> {
  await pool.query(
    `UPDATE articoli_ferramenta SET giacenza_attuale = $1, aggiornato_il = now() WHERE id = $2`,
    [giacenzaAttuale, id],
  );
}
