import { pool } from "./db";
import { ensureArticoloEsiste } from "./articoliRepository";
import { REPARTI_PRODUZIONE } from "./types";

export type StatoOfferta = "Offerta" | "Confermata" | "Persa";

export interface Offerta {
  id: string;
  commessaId: string | null;
  cliente: string;
  valoreCommessa: number | null;
  dataOfferta: string;
  stato: StatoOfferta;
  dataConsegnaPrevista: string | null;
  probabilitaChiusura: number;
  creatoDa: string;
  creatoIl: string;
  aggiornatoIl: string;
  confermatoIl: string | null;
}

export interface OffertaRiga {
  id: string;
  offertaId: string;
  codiceArticolo: string;
  articoloDescrizione: string;
  quantita: number;
  orePreventivate: number;
  creatoIl: string;
}

// pg costruisce le colonne DATE come Date a mezzanotte locale — .toISOString() le
// convertirebbe in UTC e sposterebbe il giorno indietro con fusi orari positivi (stesso
// bug già corretto altrove in questa sessione, es. assenzeRepository.ts).
function formatData(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function normalizzaData(v: unknown): string | null {
  if (v == null) return null;
  return v instanceof Date ? formatData(v) : (v as string);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOfferta(r: any): Offerta {
  return {
    id: r.id,
    commessaId: r.commessa_id,
    cliente: r.cliente,
    valoreCommessa: r.valore_commessa != null ? Number(r.valore_commessa) : null,
    dataOfferta: normalizzaData(r.data_offerta) as string,
    stato: r.stato,
    dataConsegnaPrevista: normalizzaData(r.data_consegna_prevista),
    probabilitaChiusura: Number(r.probabilita_chiusura),
    creatoDa: r.creato_da,
    creatoIl: r.creato_il,
    aggiornatoIl: r.aggiornato_il,
    confermatoIl: r.confermato_il,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRiga(r: any): OffertaRiga {
  return {
    id: r.id,
    offertaId: r.offerta_id,
    codiceArticolo: r.codice_articolo,
    articoloDescrizione: r.articolo_descrizione,
    quantita: Number(r.quantita),
    orePreventivate: Number(r.ore_preventivate),
    creatoIl: r.creato_il,
  };
}

export async function creaOfferta(entry: {
  cliente: string;
  valoreCommessa: number | null;
  dataOfferta: string;
  dataConsegnaPrevista: string | null;
  probabilitaChiusura: number;
  creatoDa: string;
}): Promise<Offerta> {
  const { rows } = await pool.query(
    `INSERT INTO offerte (cliente, valore_commessa, data_offerta, data_consegna_prevista, probabilita_chiusura, creato_da)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [entry.cliente, entry.valoreCommessa, entry.dataOfferta, entry.dataConsegnaPrevista, entry.probabilitaChiusura, entry.creatoDa]
  );
  return mapOfferta(rows[0]);
}

export async function getOfferte(stato?: StatoOfferta): Promise<Offerta[]> {
  const { rows } = stato
    ? await pool.query(`SELECT * FROM offerte WHERE stato = $1 ORDER BY data_offerta DESC`, [stato])
    : await pool.query(`SELECT * FROM offerte ORDER BY data_offerta DESC`);
  return rows.map(mapOfferta);
}

const RIGHE_JOIN = `
  SELECT r.*, a.descrizione AS articolo_descrizione
  FROM offerte_righe r
  JOIN articoli a ON a.codice_articolo = r.codice_articolo
`;

export async function getOffertaConRighe(id: string): Promise<{ offerta: Offerta; righe: OffertaRiga[] } | null> {
  const { rows } = await pool.query(`SELECT * FROM offerte WHERE id = $1`, [id]);
  if (rows.length === 0) return null;
  const { rows: righe } = await pool.query(`${RIGHE_JOIN} WHERE r.offerta_id = $1 ORDER BY r.creato_il`, [id]);
  return { offerta: mapOfferta(rows[0]), righe: righe.map(mapRiga) };
}

export interface StimaRepartoRiga {
  reparto: string;
  percentuale: number;
}

// Offerte + righe + stima reparto per il Previsionale (Fase 5.3): esclude sempre 'Persa'
// (nessun lavoro generato), il chiamante filtra ulteriormente per stato/peso a seconda della
// vista scelta. stimaReparto alimenta il fallback usato quando righe è vuoto (nessun articolo
// inserito) — vedi capacityPlannerRepository.ts.
export async function getOfferteAttiveConRighe(): Promise<{ offerta: Offerta; righe: OffertaRiga[]; stimaReparto: StimaRepartoRiga[] }[]> {
  const { rows: offerteRows } = await pool.query(`SELECT * FROM offerte WHERE stato != 'Persa' ORDER BY data_offerta`);
  if (offerteRows.length === 0) return [];
  const ids = offerteRows.map(r => r.id);
  const [{ rows: righeRows }, { rows: stimaRows }] = await Promise.all([
    pool.query(`${RIGHE_JOIN} WHERE r.offerta_id = ANY($1) ORDER BY r.creato_il`, [ids]),
    pool.query(`SELECT offerta_id, reparto, percentuale FROM offerte_stima_reparto WHERE offerta_id = ANY($1)`, [ids]),
  ]);
  const righePerOfferta = new Map<string, OffertaRiga[]>();
  for (const r of righeRows.map(mapRiga)) {
    const list = righePerOfferta.get(r.offertaId) ?? [];
    list.push(r);
    righePerOfferta.set(r.offertaId, list);
  }
  const stimaPerOfferta = new Map<string, StimaRepartoRiga[]>();
  for (const r of stimaRows) {
    const list = stimaPerOfferta.get(r.offerta_id) ?? [];
    list.push({ reparto: r.reparto, percentuale: Number(r.percentuale) });
    stimaPerOfferta.set(r.offerta_id, list);
  }
  return offerteRows.map(mapOfferta).map(offerta => ({
    offerta,
    righe: righePerOfferta.get(offerta.id) ?? [],
    stimaReparto: stimaPerOfferta.get(offerta.id) ?? [],
  }));
}

// Fallback al modulo Previsionale per quando non si inseriscono le righe articolo (deciso con
// l'utente 2026-08-07): percentuali di ripartizione manuale tra reparti delle ore stimate da
// valore_commessa/costo_orario_manodopera. A differenza delle righe, resta modificabile anche
// a offerta Confermata — è solo un input di pianificazione interna, non l'impegno commerciale.
export async function getStimaRepartoOfferta(offertaId: string): Promise<StimaRepartoRiga[]> {
  const { rows } = await pool.query(
    `SELECT reparto, percentuale FROM offerte_stima_reparto WHERE offerta_id = $1 ORDER BY reparto`,
    [offertaId]
  );
  return rows.map(r => ({ reparto: r.reparto, percentuale: Number(r.percentuale) }));
}

// Salvataggio "a insieme completo": sostituisce tutte le righe dell'offerta in una transazione
// (DELETE + INSERT), mai un update riga per riga — coerente con un form che invia l'intera
// griglia percentuali insieme.
export async function salvaStimaRepartoOfferta(offertaId: string, righe: StimaRepartoRiga[]): Promise<void> {
  for (const r of righe) {
    if (!REPARTI_PRODUZIONE.includes(r.reparto)) throw new Error(`Reparto non valido: ${r.reparto}`);
  }
  const somma = righe.reduce((s, r) => s + r.percentuale, 0);
  if (righe.length > 0 && (somma < 95 || somma > 105)) {
    throw new Error(`La somma delle percentuali deve essere ~100% (attuale: ${somma.toFixed(1)}%)`);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM offerte_stima_reparto WHERE offerta_id = $1`, [offertaId]);
    for (const r of righe) {
      if (r.percentuale <= 0) continue;
      await client.query(
        `INSERT INTO offerte_stima_reparto (offerta_id, reparto, percentuale) VALUES ($1, $2, $3)`,
        [offertaId, r.reparto, r.percentuale]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Append-only per design: ripreventivare un articolo aggiunge una nuova riga, non
// modifica mai quella precedente — lo storico dei preventivi resta consultabile.
// Righe aggiungibili solo mentre l'offerta è ancora in stato "Offerta": una volta
// confermata rappresenta l'ordine definitivo, non va più toccata da qui.
export async function aggiungiRigaOfferta(entry: { offertaId: string; codiceArticolo: string; quantita: number; orePreventivate: number }): Promise<OffertaRiga> {
  const { rows: offertaRows } = await pool.query(`SELECT stato FROM offerte WHERE id = $1`, [entry.offertaId]);
  if (offertaRows.length === 0) throw new Error("Offerta non trovata");
  if (offertaRows[0].stato !== "Offerta") throw new Error("Non è più possibile aggiungere righe: l'offerta non è più in stato 'Offerta'");

  // Crea il codice al volo se non censito (deciso con l'utente 2026-08-08): articoli è un
  // catalogo che deve poter crescere, non un elenco fisso — vedi ensureArticoloEsiste.
  await ensureArticoloEsiste(entry.codiceArticolo);

  const { rows } = await pool.query(
    `INSERT INTO offerte_righe (offerta_id, codice_articolo, quantita, ore_preventivate) VALUES ($1,$2,$3,$4) RETURNING id`,
    [entry.offertaId, entry.codiceArticolo, entry.quantita, entry.orePreventivate]
  );
  const { rows: joined } = await pool.query(`${RIGHE_JOIN} WHERE r.id = $1`, [rows[0].id]);
  return mapRiga(joined[0]);
}

export async function aggiornaCampiOfferta(id: string, entry: {
  cliente?: string;
  valoreCommessa?: number | null;
  dataOfferta?: string;
  dataConsegnaPrevista?: string | null;
  probabilitaChiusura?: number;
}): Promise<Offerta | null> {
  const campi: string[] = [];
  const valori: unknown[] = [];
  let i = 1;
  if (entry.cliente !== undefined) { campi.push(`cliente = $${i++}`); valori.push(entry.cliente); }
  if (entry.valoreCommessa !== undefined) { campi.push(`valore_commessa = $${i++}`); valori.push(entry.valoreCommessa); }
  if (entry.dataOfferta !== undefined) { campi.push(`data_offerta = $${i++}`); valori.push(entry.dataOfferta); }
  if (entry.dataConsegnaPrevista !== undefined) { campi.push(`data_consegna_prevista = $${i++}`); valori.push(entry.dataConsegnaPrevista); }
  if (entry.probabilitaChiusura !== undefined) { campi.push(`probabilita_chiusura = $${i++}`); valori.push(entry.probabilitaChiusura); }
  if (campi.length === 0) return getOffertaSoloTestata(id);
  campi.push(`aggiornato_il = now()`);
  valori.push(id);
  const { rows } = await pool.query(`UPDATE offerte SET ${campi.join(", ")} WHERE id = $${i} RETURNING *`, valori);
  return rows[0] ? mapOfferta(rows[0]) : null;
}

async function getOffertaSoloTestata(id: string): Promise<Offerta | null> {
  const { rows } = await pool.query(`SELECT * FROM offerte WHERE id = $1`, [id]);
  return rows[0] ? mapOfferta(rows[0]) : null;
}

// Cambio stato → Confermata: forza probabilita_chiusura=100, collega la Commessa scelta
// dall'utente, sovrascrive data_consegna_prevista con la data reale (Commessa.dataCarico,
// passata dal chiamante — questo repository non parla con Notion direttamente).
export async function confermaOfferta(id: string, commessaId: string, dataCaricoCommessa: string | null): Promise<Offerta | null> {
  const { rows } = await pool.query(
    `UPDATE offerte SET stato = 'Confermata', commessa_id = $2, probabilita_chiusura = 100,
       data_consegna_prevista = COALESCE($3, data_consegna_prevista), aggiornato_il = now(), confermato_il = now()
     WHERE id = $1 AND stato = 'Offerta' RETURNING *`,
    [id, commessaId, dataCaricoCommessa]
  );
  return rows[0] ? mapOfferta(rows[0]) : null;
}

export async function segnaOffertaPersa(id: string): Promise<Offerta | null> {
  const { rows } = await pool.query(
    `UPDATE offerte SET stato = 'Persa', aggiornato_il = now() WHERE id = $1 AND stato = 'Offerta' RETURNING *`,
    [id]
  );
  return rows[0] ? mapOfferta(rows[0]) : null;
}

// Nessuno stato bloccato di proposito: eliminare un'offerta (di prova, o inserita per errore)
// deve funzionare qualunque sia il suo stato — Offerta/Confermata/Persa. offerte_righe è
// ON DELETE CASCADE (verificato in schema_offerte.sql), nessun'altra tabella referenzia offerte:
// nessuna pulizia aggiuntiva necessaria oltre a questa singola DELETE.
export async function eliminaOfferta(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM offerte WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
