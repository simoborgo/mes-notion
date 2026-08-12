import type { PoolClient } from "pg";
import { pool } from "./db";
import { updateArticoloFerramentaGiacenza } from "./articoliFerramentaRepository";
import { registraMovimento, type MovimentoTipo } from "./ferramentaRepository";
import { sendNotifica } from "./notify";
import { validaQuantitaConfezione } from "./ferramentaCodici";

// Le tabelle Postgres si chiamano ancora distinte_scarico/distinte_scarico_righe (nome storico,
// da quando la feature si chiamava "Distinta di Scarico") — qui sotto i tipi/funzioni usano invece
// "Scarico", il nome attuale in UI. Rinominare le tabelle richiederebbe una migrazione sul DB
// condiviso di produzione per un guadagno puramente cosmetico: non ne vale il rischio.
export type StatoScarico = "aperta" | "chiusa" | "annullata";

export interface Scarico {
  id: string;
  odpId: string | null;
  odpLabel: string | null;
  stato: StatoScarico;
  apertaDa: string;
  apertaIl: string;
  chiusaIl: string | null;
}

export interface ScaricoRiga {
  id: string;
  scaricoId: string;
  articoloId: string;
  articoloDescrizione: string;
  articoloCodiceOs1: string;
  quantita: number;
  scaricata: boolean;
  aggiuntaIl: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapScarico(r: any): Scarico {
  return {
    id: r.id,
    odpId: r.odp_id,
    odpLabel: r.odp_label,
    stato: r.stato,
    apertaDa: r.aperta_da,
    apertaIl: r.aperta_il,
    chiusaIl: r.chiusa_il,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRiga(r: any): ScaricoRiga {
  return {
    id: r.id,
    scaricoId: r.distinta_id,
    articoloId: r.articolo_id,
    articoloDescrizione: r.articolo_descrizione,
    articoloCodiceOs1: r.articolo_codice_os1,
    quantita: Number(r.quantita),
    scaricata: r.scaricata,
    aggiuntaIl: r.aggiunta_il,
  };
}

export async function creaScarico({ odpId, odpLabel, apertaDa }: { odpId: string | null; odpLabel: string | null; apertaDa: string }): Promise<Scarico> {
  const { rows } = await pool.query(
    `INSERT INTO distinte_scarico (odp_id, odp_label, aperta_da) VALUES ($1, $2, $3) RETURNING *`,
    [odpId, odpLabel, apertaDa]
  );
  return mapScarico(rows[0]);
}

// Ferma/elimina uno scarico senza toccare la giacenza (a differenza di chiudiScarico) — utile
// per uno scarico aperto per errore, o con righe che non vanno più scaricate. A differenza della
// chiusura, non richiede alcuna riga. Le righe restano in Postgres (nessuna DELETE) ma lo
// scarico annullato non compare più né in "Aperti" né in "Storico".
export async function annullaScarico(id: string): Promise<Scarico> {
  const { rows } = await pool.query(
    `UPDATE distinte_scarico SET stato = 'annullata' WHERE id = $1 AND stato = 'aperta' RETURNING *`,
    [id]
  );
  if (rows.length === 0) throw new Error("Scarico non trovato o non più aperto");
  return mapScarico(rows[0]);
}

export async function getScarichi(stato?: StatoScarico): Promise<Scarico[]> {
  const { rows } = stato
    ? await pool.query(`SELECT * FROM distinte_scarico WHERE stato = $1 ORDER BY aperta_il DESC`, [stato])
    : await pool.query(`SELECT * FROM distinte_scarico ORDER BY aperta_il DESC LIMIT 100`);
  return rows.map(mapScarico);
}

const RIGHE_JOIN = `
  SELECT r.*, a.descrizione AS articolo_descrizione, a.codice_os1 AS articolo_codice_os1
  FROM distinte_scarico_righe r
  JOIN articoli_ferramenta a ON a.id = r.articolo_id
`;

export async function getScaricoConRighe(id: string): Promise<{ scarico: Scarico; righe: ScaricoRiga[] } | null> {
  const { rows } = await pool.query(`SELECT * FROM distinte_scarico WHERE id = $1`, [id]);
  if (rows.length === 0) return null;
  const { rows: righe } = await pool.query(`${RIGHE_JOIN} WHERE r.distinta_id = $1 ORDER BY r.aggiunta_il`, [id]);
  return { scarico: mapScarico(rows[0]), righe: righe.map(mapRiga) };
}

export async function aggiungiRigaScarico({ scaricoId, articoloId, quantita }: { scaricoId: string; articoloId: string; quantita: number }): Promise<ScaricoRiga> {
  const { rows: scaricoRows } = await pool.query(`SELECT stato FROM distinte_scarico WHERE id = $1`, [scaricoId]);
  if (scaricoRows.length === 0) throw new Error("Scarico non trovato");
  if (scaricoRows[0].stato !== "aperta") throw new Error("Lo scarico non è più aperto");

  const { rows: articoloRows } = await pool.query(
    `SELECT descrizione, metodo_gestione, quantita_standard_vaschetta FROM articoli_ferramenta WHERE id = $1`,
    [articoloId]
  );
  if (articoloRows.length === 0) throw new Error("Articolo non trovato");
  validaQuantitaConfezione(
    { metodoGestione: articoloRows[0].metodo_gestione, quantitaStandardVaschetta: articoloRows[0].quantita_standard_vaschetta != null ? Number(articoloRows[0].quantita_standard_vaschetta) : null, descrizione: articoloRows[0].descrizione },
    quantita,
  );

  const { rows } = await pool.query(
    `INSERT INTO distinte_scarico_righe (distinta_id, articolo_id, quantita) VALUES ($1, $2, $3) RETURNING id`,
    [scaricoId, articoloId, quantita]
  );
  const { rows: joined } = await pool.query(`${RIGHE_JOIN} WHERE r.id = $1`, [rows[0].id]);
  return mapRiga(joined[0]);
}

export async function rimuoviRigaScarico(rigaId: string): Promise<void> {
  await pool.query(`DELETE FROM distinte_scarico_righe WHERE id = $1 AND scaricata = false`, [rigaId]);
}

// Finalizza lo scarico: per ogni riga non ancora scaricata, decrementa la giacenza e
// registra il movimento — tutto in un'unica transazione per riga (non per l'intero scarico:
// così, se una riga fallisce, quelle già processate restano valide e "scaricata" ne impedisce
// il doppio conteggio se "chiudi" viene richiamato di nuovo). Ritorna warning di notifica
// non bloccanti, stesso schema di /api/ferramenta/articoli/[id]/scarico.
export async function chiudiScarico(id: string, operatore: string): Promise<{ warnings: string[] }> {
  const { rows: scaricoRows } = await pool.query(`SELECT * FROM distinte_scarico WHERE id = $1`, [id]);
  if (scaricoRows.length === 0) throw new Error("Scarico non trovato");
  const scarico = mapScarico(scaricoRows[0]);
  if (scarico.stato !== "aperta") throw new Error("Lo scarico non è aperto (già chiuso o annullato)");

  const { rows: righeNonScaricate } = await pool.query(
    `SELECT * FROM distinte_scarico_righe WHERE distinta_id = $1 AND scaricata = false`,
    [id]
  );

  const warnings: string[] = [];

  for (const riga of righeNonScaricate) {
    const client: PoolClient = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: articoloRows } = await client.query(
        `SELECT * FROM articoli_ferramenta WHERE id = $1 FOR UPDATE`,
        [riga.articolo_id]
      );
      if (articoloRows.length === 0) throw new Error(`Articolo ${riga.articolo_id} non trovato`);
      const a = articoloRows[0];
      const quantita = Number(riga.quantita);
      const giacenzaPrecedente = Number(a.giacenza_attuale);
      const giacenzaRisultante = giacenzaPrecedente - quantita;
      const tipo: MovimentoTipo = a.metodo_gestione === "Kanban" ? "scarico_kanban" : "scarico_a_pezzo";

      await updateArticoloFerramentaGiacenza(riga.articolo_id, giacenzaRisultante, client);
      const movimento = await registraMovimento({
        articoloId: riga.articolo_id,
        codiceOs1: a.codice_os1 || null,
        tipo,
        quantita,
        giacenzaPrecedente,
        giacenzaRisultante,
        operatore,
        fonte: "mes",
        note: `Scarico ${id}${scarico.odpLabel ? ` — ${scarico.odpLabel}` : ""}`,
        odpId: scarico.odpId,
        odpLabel: scarico.odpLabel,
      }, client);
      const { rowCount } = await client.query(
        `UPDATE distinte_scarico_righe SET scaricata = true WHERE id = $1 AND scaricata = false`,
        [riga.id]
      );
      if (rowCount === 0) throw new Error("Riga già scaricata da un'altra richiesta concorrente");
      await client.query("COMMIT");

      const sogliaMinima = a.soglia_minima != null ? Number(a.soglia_minima) : null;
      const sottoSoglia = sogliaMinima != null && giacenzaPrecedente >= sogliaMinima && giacenzaRisultante < sogliaMinima;
      if (sottoSoglia) {
        const result = await sendNotifica({
          entityType: "articolo_ferramenta",
          entityId: riga.articolo_id,
          eventType: "sotto_soglia",
          eventId: movimento.id,
          webhookUrl: process.env.N8N_WEBHOOK_FERRAMENTA,
          payload: {
            articolo_id: riga.articolo_id,
            codice_os1: a.codice_os1,
            descrizione: a.descrizione,
            giacenza_attuale: giacenzaRisultante,
            soglia_minima: sogliaMinima,
          },
        });
        if (result.warning) warnings.push(`${a.descrizione}: ${result.warning}`);
      }
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  await pool.query(`UPDATE distinte_scarico SET stato = 'chiusa', chiusa_il = now() WHERE id = $1`, [id]);
  return { warnings };
}
