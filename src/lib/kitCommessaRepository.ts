import type { PoolClient } from "pg";
import { pool } from "./db";
import { updateArticoloFerramentaGiacenza } from "./articoliFerramentaRepository";
import { registraMovimento, type MovimentoTipo } from "./ferramentaRepository";
import { sendNotifica } from "./notify";
import { validaQuantitaConfezione } from "./ferramentaCodici";

export type StatoKitCommessa = "aperto" | "chiuso";

export interface KitCommessa {
  id: string;
  commessaId: string;
  commessaLabel: string | null;
  stato: StatoKitCommessa;
  pdfRiferimentoDriveFileId: string | null;
  pdfRiferimentoNome: string | null;
  apertoDa: string;
  apertoIl: string;
  confermatoIl: string | null;
  chiusoDa: string | null;
  chiusoIl: string | null;
}

export interface KitCommessaRiga {
  id: string;
  kitCommessaId: string;
  descrizione: string;
  articoloId: string | null;
  codiceOs1: string | null;
  quantita: number;
  spuntataDa: string | null;
  spuntataIl: string | null;
  movimentoId: string | null;
  creatoIl: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapKit(r: any): KitCommessa {
  return {
    id: r.id,
    commessaId: r.commessa_id,
    commessaLabel: r.commessa_label,
    stato: r.stato,
    pdfRiferimentoDriveFileId: r.pdf_riferimento_drive_file_id,
    pdfRiferimentoNome: r.pdf_riferimento_nome,
    apertoDa: r.aperto_da,
    apertoIl: r.aperto_il,
    confermatoIl: r.confermato_il,
    chiusoDa: r.chiuso_da,
    chiusoIl: r.chiuso_il,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRiga(r: any): KitCommessaRiga {
  return {
    id: r.id,
    kitCommessaId: r.kit_commessa_id,
    descrizione: r.descrizione,
    articoloId: r.articolo_id,
    codiceOs1: r.codice_os1,
    quantita: Number(r.quantita),
    spuntataDa: r.spuntata_da,
    spuntataIl: r.spuntata_il,
    movimentoId: r.movimento_id,
    creatoIl: r.creato_il,
  };
}

export async function creaKitCommessa({ commessaId, commessaLabel, apertoDa }: { commessaId: string; commessaLabel: string | null; apertoDa: string }): Promise<KitCommessa> {
  const { rows } = await pool.query(
    `INSERT INTO kit_commessa (commessa_id, commessa_label, aperto_da) VALUES ($1, $2, $3) RETURNING *`,
    [commessaId, commessaLabel, apertoDa]
  );
  return mapKit(rows[0]);
}

export async function getKitCommesse(stato?: StatoKitCommessa): Promise<KitCommessa[]> {
  const { rows } = stato
    ? await pool.query(`SELECT * FROM kit_commessa WHERE stato = $1 ORDER BY aperto_il DESC`, [stato])
    : await pool.query(`SELECT * FROM kit_commessa ORDER BY aperto_il DESC LIMIT 100`);
  return rows.map(mapKit);
}

export async function getKitCommessaById(id: string): Promise<KitCommessa | null> {
  const { rows } = await pool.query(`SELECT * FROM kit_commessa WHERE id = $1`, [id]);
  return rows[0] ? mapKit(rows[0]) : null;
}

export async function getRigheByKit(kitCommessaId: string): Promise<KitCommessaRiga[]> {
  const { rows } = await pool.query(`SELECT * FROM kit_commessa_righe WHERE kit_commessa_id = $1 ORDER BY creato_il`, [kitCommessaId]);
  return rows.map(mapRiga);
}

// Una riga ha SEMPRE una descrizione (denormalizzata, come kit_ferramenta_righe) — articoloId
// è opzionale: se fornito, descrizione/codiceOs1 vengono presi dall'anagrafica al momento
// dell'inserimento (il "codice Modar" non è vincolante, ma se c'è lo si usa).
export async function aggiungiRigaKit({ kitCommessaId, articoloId, descrizione, quantita }: {
  kitCommessaId: string; articoloId?: string | null; descrizione?: string | null; quantita: number;
}): Promise<KitCommessaRiga> {
  let descrizioneSalvata = descrizione ?? null;
  let codiceOs1Salvato: string | null = null;
  if (articoloId) {
    const { rows } = await pool.query(`SELECT descrizione, codice_os1, metodo_gestione, quantita_standard_vaschetta FROM articoli_ferramenta WHERE id = $1`, [articoloId]);
    if (rows.length === 0) throw new Error("Articolo non trovato");
    descrizioneSalvata = rows[0].descrizione;
    codiceOs1Salvato = rows[0].codice_os1;
    validaQuantitaConfezione(
      { metodoGestione: rows[0].metodo_gestione, quantitaStandardVaschetta: rows[0].quantita_standard_vaschetta != null ? Number(rows[0].quantita_standard_vaschetta) : null, descrizione: rows[0].descrizione },
      quantita,
    );
  }
  if (!descrizioneSalvata) throw new Error("Descrizione obbligatoria per una riga senza articolo");

  const { rows } = await pool.query(
    `INSERT INTO kit_commessa_righe (kit_commessa_id, articolo_id, descrizione, codice_os1, quantita) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [kitCommessaId, articoloId ?? null, descrizioneSalvata, codiceOs1Salvato, quantita]
  );
  return mapRiga(rows[0]);
}

export async function rimuoviRigaKit(rigaId: string): Promise<void> {
  await pool.query(`DELETE FROM kit_commessa_righe WHERE id = $1 AND spuntata_il IS NULL`, [rigaId]);
}

export async function confermaKit(id: string): Promise<KitCommessa> {
  const { rows } = await pool.query(`UPDATE kit_commessa SET confermato_il = now() WHERE id = $1 RETURNING *`, [id]);
  if (rows.length === 0) throw new Error("Kit Commessa non trovato");
  return mapKit(rows[0]);
}

export async function setPdfRiferimento(id: string, driveFileId: string, nomeFile: string): Promise<void> {
  await pool.query(`UPDATE kit_commessa SET pdf_riferimento_drive_file_id = $1, pdf_riferimento_nome = $2 WHERE id = $3`, [driveFileId, nomeFile, id]);
}

// "Annulla" in fase di preparazione: elimina davvero la riga (a differenza di chiudiKit) —
// sicuro solo perché non è mai stato confermato/notificato e non ha righe, quindi non c'è
// nulla da recuperare né alcuna notifica già inviata da rendere incoerente.
export async function eliminaKitCommessaVuoto(id: string): Promise<void> {
  const { rows } = await pool.query(`SELECT confermato_il FROM kit_commessa WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error("Kit Commessa non trovato");
  if (rows[0].confermato_il) throw new Error("Non annullabile: già confermato");
  const { rows: righe } = await pool.query(`SELECT id FROM kit_commessa_righe WHERE kit_commessa_id = $1 LIMIT 1`, [id]);
  if (righe.length > 0) throw new Error("Non annullabile: contiene già righe");
  await pool.query(`DELETE FROM kit_commessa WHERE id = $1`, [id]);
}

export async function chiudiKit(id: string, operatore: string): Promise<KitCommessa> {
  const { rows } = await pool.query(
    `UPDATE kit_commessa SET stato = 'chiuso', chiuso_da = $2, chiuso_il = now() WHERE id = $1 AND stato = 'aperto' RETURNING *`,
    [id, operatore]
  );
  if (rows.length === 0) throw new Error("Kit Commessa non trovato o già chiuso");
  return mapKit(rows[0]);
}

// Spunta una riga: se ha (o riceve ora) un articolo collegato, scarica davvero la giacenza —
// altrimenti resta solo checklist. Il magazziniere decide riga per riga collegando un articolo
// al volo (parametro articoloId) quando la riga è nata come testo libero.
export async function spuntaRiga(rigaId: string, { articoloId, operatore }: { articoloId?: string | null; operatore: string }): Promise<{ riga: KitCommessaRiga; warnings: string[] }> {
  const { rows: rigaRows } = await pool.query(`SELECT * FROM kit_commessa_righe WHERE id = $1`, [rigaId]);
  if (rigaRows.length === 0) throw new Error("Riga non trovata");
  const rigaEsistente = mapRiga(rigaRows[0]);
  if (rigaEsistente.spuntataIl) throw new Error("Riga già spuntata");

  const effettivoArticoloId = rigaEsistente.articoloId ?? articoloId ?? null;
  const warnings: string[] = [];

  if (!effettivoArticoloId) {
    // Pura checklist, nessun tocco alla giacenza.
    const { rows } = await pool.query(
      `UPDATE kit_commessa_righe SET spuntata_da = $2, spuntata_il = now() WHERE id = $1 RETURNING *`,
      [rigaId, operatore]
    );
    return { riga: mapRiga(rows[0]), warnings };
  }

  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: articoloRows } = await client.query(`SELECT * FROM articoli_ferramenta WHERE id = $1 FOR UPDATE`, [effettivoArticoloId]);
    if (articoloRows.length === 0) throw new Error("Articolo non trovato");
    const a = articoloRows[0];
    const quantita = rigaEsistente.quantita;
    // La quantità della riga può essere nata da testo libero, prima che un articolo Kanban fosse
    // collegato (qui o già in aggiungiRigaKit) — va sempre rivalidata contro la Confezione
    // dell'articolo effettivamente collegato, non solo al momento dell'inserimento.
    validaQuantitaConfezione(
      { metodoGestione: a.metodo_gestione, quantitaStandardVaschetta: a.quantita_standard_vaschetta != null ? Number(a.quantita_standard_vaschetta) : null, descrizione: a.descrizione },
      quantita,
    );
    const giacenzaPrecedente = Number(a.giacenza_attuale);
    const giacenzaRisultante = giacenzaPrecedente - quantita;
    const tipo: MovimentoTipo = a.metodo_gestione === "Kanban" ? "scarico_kanban" : "scarico_a_pezzo";

    await updateArticoloFerramentaGiacenza(effettivoArticoloId, giacenzaRisultante, client);
    const movimento = await registraMovimento({
      articoloId: effettivoArticoloId,
      codiceOs1: a.codice_os1 || null,
      tipo,
      quantita,
      giacenzaPrecedente,
      giacenzaRisultante,
      operatore,
      fonte: "mes",
      note: `Kit Commessa ${rigaEsistente.kitCommessaId} — ${rigaEsistente.descrizione}`,
    }, client);

    const { rows: rigaAggiornata } = await client.query(
      `UPDATE kit_commessa_righe SET articolo_id = $2, codice_os1 = $3, spuntata_da = $4, spuntata_il = now(), movimento_id = $5 WHERE id = $1 RETURNING *`,
      [rigaId, effettivoArticoloId, a.codice_os1 || null, operatore, movimento.id]
    );
    await client.query("COMMIT");

    const sogliaMinima = a.soglia_minima != null ? Number(a.soglia_minima) : null;
    const sottoSoglia = sogliaMinima != null && giacenzaPrecedente >= sogliaMinima && giacenzaRisultante < sogliaMinima;
    if (sottoSoglia) {
      const result = await sendNotifica({
        entityType: "articolo_ferramenta",
        entityId: effettivoArticoloId,
        eventType: "sotto_soglia",
        eventId: movimento.id,
        webhookUrl: process.env.N8N_WEBHOOK_FERRAMENTA,
        payload: {
          articolo_id: effettivoArticoloId,
          codice_os1: a.codice_os1,
          descrizione: a.descrizione,
          giacenza_attuale: giacenzaRisultante,
          soglia_minima: sogliaMinima,
        },
      });
      if (result.warning) warnings.push(`${a.descrizione}: ${result.warning}`);
    }

    return { riga: mapRiga(rigaAggiornata[0]), warnings };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
