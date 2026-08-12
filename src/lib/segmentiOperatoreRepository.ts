import type { PoolClient } from "pg";
import { pool } from "./db";
import { aggiungiOreRegistrate } from "./oreRepository";
import { aggiornaStandardRepartoPerOdp } from "./standardRepartoRepository";

// Oltre questa soglia un segmento aperto è quasi certamente stato dimenticato (tablet spento,
// operatore andato via senza premere "Ho finito per oggi") — si chiude comunque ma si marca
// come anomalo e si limita l'importo sommato a ore_registrate, invece di sommare ore assurde.
const SOGLIA_ANOMALIA_ORE = 12;

export interface Segmento {
  id: string;
  matricola: string;
  data: string;
  odp: string;
  rif: boolean;
  iniziatoAlle: string;
  chiusoAlle: string | null;
  ore: number | null;
  anomalo: boolean;
  daBuco: boolean;
}

function formatData(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): Segmento {
  return {
    id: r.id,
    matricola: r.matricola,
    data: r.data instanceof Date ? formatData(r.data) : r.data,
    odp: r.odp,
    rif: r.rif,
    iniziatoAlle: r.iniziato_alle instanceof Date ? r.iniziato_alle.toISOString() : r.iniziato_alle,
    chiusoAlle: r.chiuso_alle instanceof Date ? r.chiuso_alle.toISOString() : r.chiuso_alle,
    ore: r.ore != null ? Number(r.ore) : null,
    anomalo: r.anomalo,
    daBuco: r.da_buco,
  };
}

function arrotondaMezzo(n: number): number {
  return Math.round(n * 2) / 2;
}

export async function getMatricoleConSegmentoAperto(): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT matricola FROM ore_segmenti_odp WHERE chiuso_alle IS NULL`
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => r.matricola as string);
}

export async function getSegmentoAperto(matricola: string): Promise<Segmento | null> {
  const { rows } = await pool.query(
    `SELECT * FROM ore_segmenti_odp WHERE matricola = $1 AND chiuso_alle IS NULL`,
    [matricola]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getSegmentiOggi(matricola: string, data: string): Promise<Segmento[]> {
  const { rows } = await pool.query(
    `SELECT * FROM ore_segmenti_odp WHERE matricola = $1 AND data = $2 AND chiuso_alle IS NOT NULL ORDER BY iniziato_alle`,
    [matricola, data]
  );
  return rows.map(mapRow);
}

export async function getSegmentiAnomali(): Promise<Segmento[]> {
  const { rows } = await pool.query(
    `SELECT * FROM ore_segmenti_odp WHERE anomalo = true ORDER BY data DESC, iniziato_alle DESC`
  );
  return rows.map(mapRow);
}

// Il segmento esiste solo per segnalare "verifica questo" — una volta rivisto (la correzione
// vera e propria si fa su ore_registrate, da "Oggi") non serve tenerne traccia permanente,
// a differenza di ore_registrate che è il dato di business. Scoped a anomalo=true per sicurezza:
// non deve poter cancellare un segmento normale.
export async function eliminaSegmentoAnomalo(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM ore_segmenti_odp WHERE id = $1 AND anomalo = true`,
    [id]
  );
  return (rowCount ?? 0) > 0;
}

interface DatiOperatore {
  matricola: string;
  cognome: string;
  nome: string;
  azienda: string | null;
  reparto: string | null;
}

// Chiude il segmento aperto (se esiste), somma le ore risultanti a ore_registrate, poi ne
// apre uno nuovo — tutto in un'unica transazione. Un solo segmento aperto per matricola è
// garantito dall'indice univoco parziale su ore_segmenti_odp(matricola) WHERE chiuso_alle IS NULL.
// iniziatoAlle: di norma "adesso" (default colonna); il primo ODP della giornata, se confermato
// entro la soglia di tolleranza dal buco (vedi /api/ore/operatore/segmento), passa invece
// l'orario nominale di inizio turno — altrimenti i minuti fra l'inizio turno e il tap sul tablet
// andrebbero persi anche quando non c'è nulla da chiedere all'operatore.
export async function apriSegmento(op: DatiOperatore, odp: string, rif: boolean, iniziatoAlle?: Date): Promise<Segmento> {
  const client = await pool.connect();
  let odpChiuso: string | null;
  try {
    await client.query("BEGIN");
    odpChiuso = await chiudiSegmentoInterno(client, op);
    const oggi = formatData(new Date());
    const { rows } = await client.query(
      `INSERT INTO ore_segmenti_odp (matricola, data, odp, rif, iniziato_alle) VALUES ($1, $2, $3, $4, COALESCE($5, now())) RETURNING *`,
      [op.matricola, oggi, odp, rif, iniziatoAlle ?? null]
    );
    await client.query("COMMIT");
    if (odpChiuso) void aggiornaStandardRepartoPerOdp(odpChiuso);
    return mapRow(rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// chiusoAlle: timestamp di chiusura da assegnare, di norma "adesso" (chiusura manuale/passaggio
// ODP). La chiusura automatica di fine turno (vedi /api/webhooks/ore-chiusura-automatica) passa
// invece l'orario nominale di fine turno del giorno — non "adesso" — perché per un segmento
// dimenticato l'unica stima ragionevole è "se n'è andato all'orario previsto", non l'istante
// (spesso molto più tardo) in cui il job schedulato è passato a controllare.
export async function chiudiSegmentoCorrente(op: DatiOperatore, chiusoAlle?: Date): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const odpChiuso = await chiudiSegmentoInterno(client, op, chiusoAlle);
    await client.query("COMMIT");
    if (odpChiuso) void aggiornaStandardRepartoPerOdp(odpChiuso);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Ritorna l'odp del segmento chiuso (per far scattare aggiornaStandardRepartoPerOdp DOPO il
// commit della transazione — mai dentro, altrimenti il ricalcolo partirebbe su una connessione
// separata prima che le ore appena scritte siano visibili), o null se non c'era nulla da chiudere.
async function chiudiSegmentoInterno(client: PoolClient, op: DatiOperatore, chiusoAlle?: Date): Promise<string | null> {
  const { rows } = await client.query(
    `SELECT * FROM ore_segmenti_odp WHERE matricola = $1 AND chiuso_alle IS NULL FOR UPDATE`,
    [op.matricola]
  );
  if (rows.length === 0) return null;
  const aperto = rows[0];
  const iniziatoAlle: Date = aperto.iniziato_alle;
  const dataSegmento = aperto.data instanceof Date ? formatData(aperto.data) : aperto.data;
  const chiusura = chiusoAlle ?? new Date();
  const oreEsatte = (chiusura.getTime() - iniziatoAlle.getTime()) / 3_600_000;
  const anomalo = oreEsatte > SOGLIA_ANOMALIA_ORE;
  const oreSegmento = Math.min(oreEsatte, SOGLIA_ANOMALIA_ORE); // valore "contabile" (capped), non ancora arrotondato

  await client.query(
    `UPDATE ore_segmenti_odp SET chiuso_alle = $4, ore = $2, anomalo = $3 WHERE id = $1`,
    [aperto.id, Math.round(oreSegmento * 100) / 100, anomalo, chiusura]
  );

  await registraOreDelta(client, op, dataSegmento, aperto.odp, aperto.rif, oreSegmento);

  return aperto.odp as string;
}

// Arrotondare ogni segmento isolatamente perderebbe silenziosamente i cambi rapidi (es. tre
// passaggi da 10 minuti sullo stesso ODP farebbero 0h ciascuno, anche se insieme fanno 0,5h).
// Si arrotonda invece il TOTALE cumulato (esatto, dai timestamp) di oggi su questo ODP, e si
// somma solo la differenza rispetto a quanto già arrotondato prima di questo segmento — così
// nessun minuto va perso finché il cumulato giornaliero sull'ODP non supera i 15 minuti.
// Condivisa fra la chiusura normale di un segmento e l'inserimento retroattivo (buco di inizio
// giornata, vedi registraSegmentoRetroattivo): richiede che il segmento sia già scritto come
// chiuso nella stessa transazione, cosi la SELECT sotto lo include nel totale.
async function registraOreDelta(client: PoolClient, op: DatiOperatore, dataSegmento: string, odp: string, rif: boolean, oreSegmento: number): Promise<void> {
  const { rows: totRows } = await client.query(
    `SELECT COALESCE(SUM(LEAST(EXTRACT(EPOCH FROM (chiuso_alle - iniziato_alle)) / 3600, $4)), 0) AS totale
     FROM ore_segmenti_odp
     WHERE matricola = $1 AND data = $2 AND odp = $3 AND chiuso_alle IS NOT NULL`,
    [op.matricola, dataSegmento, odp, SOGLIA_ANOMALIA_ORE]
  );
  const totaleConQuesto = Number(totRows[0].totale);
  const totalePrima = totaleConQuesto - oreSegmento;
  const delta = arrotondaMezzo(totaleConQuesto) - arrotondaMezzo(totalePrima);

  if (delta > 0) {
    await aggiungiOreRegistrate({
      data: dataSegmento,
      matricola: op.matricola,
      cognome: op.cognome,
      nome: op.nome,
      azienda: op.azienda,
      reparto: op.reparto,
      odp,
      oreDelta: delta,
      rif,
    }, client);
  }
}

// Copre il buco tra l'inizio nominale del turno e la conferma del primo ODP della giornata:
// inserisce direttamente un segmento GIÀ chiuso (non è mai passato per "aperto", quindi non
// tocca l'indice univoco sui soli segmenti aperti) sull'ODP indicato dall'operatore per quel
// periodo, marcato da_buco=true. Va chiamata PRIMA di apriSegmento() per il nuovo ODP scelto
// adesso, altrimenti quest'ultimo non troverebbe nulla da chiudere e va bene così (nessun
// conflitto: l'indice univoco sui segmenti aperti riguarda solo le righe con chiuso_alle IS NULL).
//
// Idempotente: l'indice univoco parziale ore_segmenti_odp_buco_unico(matricola, data) WHERE
// da_buco garantisce al massimo un segmento-buco per operatore/giorno. Un doppio tap o un retry
// di rete che arrivano qui una seconda volta (stessa richiesta o l'ODP scelto è diverso, non
// importa) trovano ON CONFLICT DO NOTHING: niente riga in più, niente doppio conteggio in
// ore_registrate — si ritorna semplicemente il segmento-buco già scritto dal primo tentativo.
export async function registraSegmentoRetroattivo(op: DatiOperatore, odp: string, iniziatoAlle: Date, chiusoAlle: Date): Promise<Segmento> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dataSegmento = formatData(iniziatoAlle);
    const oreEsatte = (chiusoAlle.getTime() - iniziatoAlle.getTime()) / 3_600_000;
    const anomalo = oreEsatte > SOGLIA_ANOMALIA_ORE;
    const oreSegmento = Math.min(oreEsatte, SOGLIA_ANOMALIA_ORE);
    const { rows } = await client.query(
      `INSERT INTO ore_segmenti_odp (matricola, data, odp, rif, iniziato_alle, chiuso_alle, ore, anomalo, da_buco)
       VALUES ($1, $2, $3, false, $4, $5, $6, $7, true)
       ON CONFLICT (matricola, data) WHERE da_buco DO NOTHING
       RETURNING *`,
      [op.matricola, dataSegmento, odp, iniziatoAlle, chiusoAlle, Math.round(oreSegmento * 100) / 100, anomalo]
    );
    if (rows.length === 0) {
      const { rows: esistente } = await client.query(
        `SELECT * FROM ore_segmenti_odp WHERE matricola = $1 AND data = $2 AND da_buco LIMIT 1`,
        [op.matricola, dataSegmento]
      );
      await client.query("COMMIT");
      return mapRow(esistente[0]);
    }
    await registraOreDelta(client, op, dataSegmento, odp, false, oreSegmento);
    await client.query("COMMIT");
    return mapRow(rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
