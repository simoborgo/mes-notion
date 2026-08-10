import type { PoolClient } from "pg";
import { pool } from "./db";
import { updateArticoloFerramentaGiacenza } from "./articoliFerramentaRepository";
import { registraMovimento, type MovimentoTipo } from "./ferramentaRepository";
import { sendNotifica } from "./notify";

export type StatoDistinta = "aperta" | "chiusa" | "annullata";

export interface DistintaScarico {
  id: string;
  odpId: string | null;
  odpLabel: string | null;
  // Alternativo a odp*: per un foglio/kit di scarico legato alla sola Commessa, senza uno
  // specifico ODP/Scheda — mai entrambi popolati dalla UI, ma nessun vincolo DB li rende esclusivi.
  commessaId: string | null;
  commessaLabel: string | null;
  stato: StatoDistinta;
  apertaDa: string;
  apertaIl: string;
  chiusaIl: string | null;
  // Indipendente da stato/chiusura: segna quando è stata notificata al magazziniere come
  // "pronta" — stessa logica del Kit Ferramenta ODP (kit/[schedaId]/conferma).
  confermataIl: string | null;
}

export interface DistintaScaricoRiga {
  id: string;
  distintaId: string;
  articoloId: string;
  articoloDescrizione: string;
  articoloCodiceOs1: string;
  quantita: number;
  scaricata: boolean;
  aggiuntaIl: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDistinta(r: any): DistintaScarico {
  return {
    id: r.id,
    odpId: r.odp_id,
    odpLabel: r.odp_label,
    commessaId: r.commessa_id,
    commessaLabel: r.commessa_label,
    stato: r.stato,
    apertaDa: r.aperta_da,
    apertaIl: r.aperta_il,
    chiusaIl: r.chiusa_il,
    confermataIl: r.confermata_il,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRiga(r: any): DistintaScaricoRiga {
  return {
    id: r.id,
    distintaId: r.distinta_id,
    articoloId: r.articolo_id,
    articoloDescrizione: r.articolo_descrizione,
    articoloCodiceOs1: r.articolo_codice_os1,
    quantita: Number(r.quantita),
    scaricata: r.scaricata,
    aggiuntaIl: r.aggiunta_il,
  };
}

export async function creaDistinta({ odpId, odpLabel, commessaId, commessaLabel, apertaDa }: {
  odpId: string | null; odpLabel: string | null;
  commessaId?: string | null; commessaLabel?: string | null;
  apertaDa: string;
}): Promise<DistintaScarico> {
  const { rows } = await pool.query(
    `INSERT INTO distinte_scarico (odp_id, odp_label, commessa_id, commessa_label, aperta_da) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [odpId, odpLabel, commessaId ?? null, commessaLabel ?? null, apertaDa]
  );
  return mapDistinta(rows[0]);
}

export async function confermaDistinta(id: string): Promise<DistintaScarico> {
  const { rows } = await pool.query(
    `UPDATE distinte_scarico SET confermata_il = now() WHERE id = $1 RETURNING *`,
    [id]
  );
  if (rows.length === 0) throw new Error("Distinta non trovata");
  return mapDistinta(rows[0]);
}

export async function getDistinte(stato?: StatoDistinta): Promise<DistintaScarico[]> {
  const { rows } = stato
    ? await pool.query(`SELECT * FROM distinte_scarico WHERE stato = $1 ORDER BY aperta_il DESC`, [stato])
    : await pool.query(`SELECT * FROM distinte_scarico ORDER BY aperta_il DESC LIMIT 100`);
  return rows.map(mapDistinta);
}

const RIGHE_JOIN = `
  SELECT r.*, a.descrizione AS articolo_descrizione, a.codice_os1 AS articolo_codice_os1
  FROM distinte_scarico_righe r
  JOIN articoli_ferramenta a ON a.id = r.articolo_id
`;

export async function getDistintaConRighe(id: string): Promise<{ distinta: DistintaScarico; righe: DistintaScaricoRiga[] } | null> {
  const { rows } = await pool.query(`SELECT * FROM distinte_scarico WHERE id = $1`, [id]);
  if (rows.length === 0) return null;
  const { rows: righe } = await pool.query(`${RIGHE_JOIN} WHERE r.distinta_id = $1 ORDER BY r.aggiunta_il`, [id]);
  return { distinta: mapDistinta(rows[0]), righe: righe.map(mapRiga) };
}

export async function aggiungiRigaDistinta({ distintaId, articoloId, quantita }: { distintaId: string; articoloId: string; quantita: number }): Promise<DistintaScaricoRiga> {
  const { rows: distintaRows } = await pool.query(`SELECT stato FROM distinte_scarico WHERE id = $1`, [distintaId]);
  if (distintaRows.length === 0) throw new Error("Distinta non trovata");
  if (distintaRows[0].stato !== "aperta") throw new Error("La distinta non è più aperta");

  const { rows } = await pool.query(
    `INSERT INTO distinte_scarico_righe (distinta_id, articolo_id, quantita) VALUES ($1, $2, $3) RETURNING id`,
    [distintaId, articoloId, quantita]
  );
  const { rows: joined } = await pool.query(`${RIGHE_JOIN} WHERE r.id = $1`, [rows[0].id]);
  return mapRiga(joined[0]);
}

export async function rimuoviRigaDistinta(rigaId: string): Promise<void> {
  await pool.query(`DELETE FROM distinte_scarico_righe WHERE id = $1 AND scaricata = false`, [rigaId]);
}

// Finalizza la distinta: per ogni riga non ancora scaricata, decrementa la giacenza e
// registra il movimento — tutto in un'unica transazione per riga (non per l'intera distinta:
// così, se una riga fallisce, quelle già processate restano valide e "scaricata" ne impedisce
// il doppio conteggio se "chiudi" viene richiamato di nuovo). Ritorna warning di notifica
// non bloccanti, stesso schema di /api/ferramenta/articoli/[id]/scarico.
export async function chiudiDistinta(id: string, operatore: string): Promise<{ warnings: string[] }> {
  const { rows: distintaRows } = await pool.query(`SELECT * FROM distinte_scarico WHERE id = $1`, [id]);
  if (distintaRows.length === 0) throw new Error("Distinta non trovata");
  const distinta = mapDistinta(distintaRows[0]);
  if (distinta.stato !== "aperta") throw new Error("La distinta non è aperta (già chiusa o annullata)");

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
        note: `Distinta di scarico ${id}${distinta.odpLabel ? ` — ${distinta.odpLabel}` : distinta.commessaLabel ? ` — ${distinta.commessaLabel}` : ""}`,
        odpId: distinta.odpId,
        odpLabel: distinta.odpLabel,
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
