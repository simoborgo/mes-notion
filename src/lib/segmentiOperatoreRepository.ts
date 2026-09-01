import type { PoolClient } from "pg";
import { pool } from "./db";
import { aggiungiOreRegistrate } from "./oreRepository";
import { aggiornaStandardRepartoPerOdp } from "./standardRepartoRepository";
import { getOrariTurno } from "./parametriGeneraliRepository";
import { oreNetteSottraendoPausa } from "./oraLocale";
import { logOperation } from "./audit";

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

// Anomalia rilevata confrontando quanto risulta dai segmenti (fonte di verità) con quanto è
// realmente scritto in ore_registrate — vedi registraOreDelta e segnalaAnomaliaRegistrazione.
interface AnomaliaRegistrazione {
  matricola: string;
  odp: string;
  data: string;
  atteso: number;
  trovato: number | null;
}

// Scrive l'anomalia in Audit Log (visibile in Admin > Impostazioni > Audit Log) — DOPO il commit
// della transazione che l'ha rilevata, mai dentro (stesso motivo di aggiornaStandardRepartoPerOdp:
// un problema qui non deve mai far fallire/rollbackare la scrittura delle ore).
async function segnalaAnomaliaRegistrazione(a: AnomaliaRegistrazione): Promise<void> {
  console.error(`[ore-segmenti] ANOMALIA matricola=${a.matricola} odp=${a.odp} data=${a.data} atteso=${a.atteso} trovato=${a.trovato ?? "assente"}`);
  await logOperation("Sistema", "UPDATE", "ore_registrate", `${a.matricola}:${a.odp}`, {
    via: "ore-segmenti-alert",
    data: a.data,
    atteso: a.atteso,
    trovato: a.trovato,
    nota: a.trovato === null
      ? "Riga mancante in ore_registrate nonostante ore accumulate nei segmenti"
      : "ore in ore_registrate diverse da quanto risulta dai segmenti",
  });
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
  const orari = await getOrariTurno();
  const client = await pool.connect();
  let esito: { odpChiuso: string | null; anomalia: AnomaliaRegistrazione | null };
  // Diagnostica temporanea, vedi commento in chiudiSegmentoInterno — utile per capire se due
  // richieste per lo stesso operatore si sovrappongono nel tempo (doppio tap/retry di rete).
  console.log(`[ore-segmenti] apriSegmento INIZIO matricola=${op.matricola} nuovoOdp=${odp} t=${new Date().toISOString()}`);
  try {
    await client.query("BEGIN");
    esito = await chiudiSegmentoInterno(client, op, orari);
    const oggi = formatData(new Date());
    const { rows } = await client.query(
      `INSERT INTO ore_segmenti_odp (matricola, data, odp, rif, iniziato_alle) VALUES ($1, $2, $3, $4, COALESCE($5, now())) RETURNING *`,
      [op.matricola, oggi, odp, rif, iniziatoAlle ?? null]
    );
    await client.query("COMMIT");
    console.log(`[ore-segmenti] apriSegmento COMMIT matricola=${op.matricola} chiusoOdp=${esito.odpChiuso ?? "-"} nuovoSegmentoId=${rows[0].id}`);
    if (esito.odpChiuso) void aggiornaStandardRepartoPerOdp(esito.odpChiuso);
    if (esito.anomalia) void segnalaAnomaliaRegistrazione(esito.anomalia);
    return mapRow(rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(`[ore-segmenti] apriSegmento ROLLBACK matricola=${op.matricola} nuovoOdp=${odp}`, e);
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
  const orari = await getOrariTurno();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const esito = await chiudiSegmentoInterno(client, op, orari, chiusoAlle);
    await client.query("COMMIT");
    if (esito.odpChiuso) void aggiornaStandardRepartoPerOdp(esito.odpChiuso);
    if (esito.anomalia) void segnalaAnomaliaRegistrazione(esito.anomalia);
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
async function chiudiSegmentoInterno(
  client: PoolClient, op: DatiOperatore,
  orari: { turnoFerialePausaInizio: string; turnoFerialePausaFine: string },
  chiusoAlle?: Date
): Promise<{ odpChiuso: string | null; anomalia: AnomaliaRegistrazione | null }> {
  const { rows } = await client.query(
    `SELECT * FROM ore_segmenti_odp WHERE matricola = $1 AND chiuso_alle IS NULL FOR UPDATE`,
    [op.matricola]
  );
  if (rows.length === 0) return { odpChiuso: null, anomalia: null };
  const aperto = rows[0];
  const iniziatoAlle: Date = aperto.iniziato_alle;
  const dataSegmento = aperto.data instanceof Date ? formatData(aperto.data) : aperto.data;
  const chiusura = chiusoAlle ?? new Date();
  // oreEsatte (grezze, senza sottrarre la pausa) decide solo l'anomalia — un segmento dimenticato
  // va segnalato in base al tempo orologio realmente trascorso, non a quello "contabile".
  const oreEsatte = (chiusura.getTime() - iniziatoAlle.getTime()) / 3_600_000;
  const anomalo = oreEsatte > SOGLIA_ANOMALIA_ORE;
  const oreNette = oreNetteSottraendoPausa(iniziatoAlle, chiusura, dataSegmento, orari);
  const oreSegmento = Math.min(oreNette, SOGLIA_ANOMALIA_ORE); // valore "contabile" (netto pausa, capped), non ancora arrotondato

  // Diagnostica temporanea (indagine 2026-08-31: alcune chiusure ravvicinate non producevano
  // una riga in ore_registrate nonostante un delta positivo) — da rimuovere una volta chiarita
  // la causa. Traccia ogni chiusura per correlarla col log di registraOreDelta sotto.
  console.log(`[ore-segmenti] chiudo id=${aperto.id} odp=${aperto.odp} matricola=${op.matricola} iniziato=${iniziatoAlle.toISOString()} chiuso=${chiusura.toISOString()} oreEsatte=${oreEsatte.toFixed(4)} oreNette=${oreNette.toFixed(4)}`);

  await client.query(
    `UPDATE ore_segmenti_odp SET chiuso_alle = $4, ore = $2, anomalo = $3 WHERE id = $1`,
    [aperto.id, Math.round(oreSegmento * 100) / 100, anomalo, chiusura]
  );

  const anomalia = await registraOreDelta(client, op, dataSegmento, aperto.odp, aperto.rif, oreSegmento);

  return { odpChiuso: aperto.odp as string, anomalia };
}

// Arrotondare ogni segmento isolatamente perderebbe silenziosamente i cambi rapidi (es. tre
// passaggi da 10 minuti sullo stesso ODP farebbero 0h ciascuno, anche se insieme fanno 0,5h).
// Si arrotonda invece il TOTALE cumulato (esatto, dai timestamp) di oggi su questo ODP, e si
// somma solo la differenza rispetto a quanto già arrotondato prima di questo segmento — così
// nessun minuto va perso finché il cumulato giornaliero sull'ODP non supera i 15 minuti.
// Condivisa fra la chiusura normale di un segmento e l'inserimento retroattivo (buco di inizio
// giornata, vedi registraSegmentoRetroattivo): richiede che il segmento sia già scritto come
// chiuso nella stessa transazione, cosi la SELECT sotto lo include nel totale.
async function registraOreDelta(client: PoolClient, op: DatiOperatore, dataSegmento: string, odp: string, rif: boolean, oreSegmento: number): Promise<AnomaliaRegistrazione | null> {
  // Somma la colonna `ore` già scritta su ogni segmento chiuso (netta pausa, capped all'anomalia
  // — vedi chiudiSegmentoInterno) invece di ricalcolare dai timestamp grezzi: la sottrazione
  // della pausa richiede la conversione fuso orario di oreNetteSottraendoPausa, non riproducibile
  // in SQL puro senza duplicare quella logica.
  const { rows: totRows } = await client.query(
    `SELECT COALESCE(SUM(ore), 0) AS totale
     FROM ore_segmenti_odp
     WHERE matricola = $1 AND data = $2 AND odp = $3 AND chiuso_alle IS NOT NULL`,
    [op.matricola, dataSegmento, odp]
  );
  const totaleConQuesto = Number(totRows[0].totale);
  const totalePrima = totaleConQuesto - oreSegmento;
  const delta = arrotondaMezzo(totaleConQuesto) - arrotondaMezzo(totalePrima);
  const atteso = arrotondaMezzo(totaleConQuesto);

  // Diagnostica temporanea, vedi commento in chiudiSegmentoInterno sopra.
  console.log(`[ore-segmenti] delta odp=${odp} matricola=${op.matricola} data=${dataSegmento} totaleEsatto=${totaleConQuesto.toFixed(4)} totalePrima=${totalePrima.toFixed(4)} delta=${delta}`);

  if (delta > 0) {
    const scritta = await aggiungiOreRegistrate({
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
    console.log(`[ore-segmenti] scritta id=${scritta.id} odp=${odp} matricola=${op.matricola} oreTotaliDopo=${scritta.ore}`);
    // Verifica: la riga appena scritta deve avere `ore` = atteso. Se non torna, qualcosa nella
    // catena chiudo→delta→scrittura si è comportato in modo inatteso — è esattamente il tipo di
    // caso (indagine 2026-08-31) che questo alert serve a beccare sul fatto.
    if (Math.abs(Number(scritta.ore) - atteso) > 0.01) {
      return { matricola: op.matricola, odp, data: dataSegmento, atteso, trovato: Number(scritta.ore) };
    }
    return null;
  }

  // delta <= 0: in questo ramo non scriviamo nulla, quindi se il totale atteso è positivo la riga
  // deve già esistere da una chiusura precedente — se manca (o ha un valore diverso), una
  // scrittura passata è andata persa e qui non ce ne accorgeremmo mai altrimenti.
  if (atteso > 0) {
    const { rows: verifica } = await client.query(
      `SELECT ore FROM ore_registrate WHERE data = $1 AND matricola = $2 AND odp = $3`,
      [dataSegmento, op.matricola, odp]
    );
    const trovato = verifica[0] ? Number(verifica[0].ore) : null;
    if (trovato === null || Math.abs(trovato - atteso) > 0.01) {
      return { matricola: op.matricola, odp, data: dataSegmento, atteso, trovato };
    }
  }
  return null;
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
  const orari = await getOrariTurno();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dataSegmento = formatData(iniziatoAlle);
    const oreEsatte = (chiusoAlle.getTime() - iniziatoAlle.getTime()) / 3_600_000;
    const anomalo = oreEsatte > SOGLIA_ANOMALIA_ORE;
    const oreNette = oreNetteSottraendoPausa(iniziatoAlle, chiusoAlle, dataSegmento, orari);
    const oreSegmento = Math.min(oreNette, SOGLIA_ANOMALIA_ORE);
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
    const anomalia = await registraOreDelta(client, op, dataSegmento, odp, false, oreSegmento);
    await client.query("COMMIT");
    // DOPO il commit, mai dentro la transazione (stesso motivo di apriSegmento/chiudiSegmentoCorrente
    // sopra): il ricalcolo deve vedere le ore appena scritte, non partire prima che siano visibili.
    void aggiornaStandardRepartoPerOdp(odp);
    if (anomalia) void segnalaAnomaliaRegistrazione(anomalia);
    return mapRow(rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
