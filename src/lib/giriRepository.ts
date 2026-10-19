import type { PoolClient } from "pg";
import { pool, dateToStr } from "./db";
import { dataOggiRoma } from "./oraLocale";
import type { Giro, GiroInput } from "./types";

// Giri esterni di una Scheda (vedi verifiche-backend/schema_schede_giri.sql).
//
// Le colonne esterne su `schede` (fornitore_id, stato_prod_esterna, data_uscita_materiale,
// data_rientro_prevista, data_rientro_effettiva, produzione_esterna) sono il RIEPILOGO del giro
// attivo: ogni scrittura di un giro passa da `sincronizzaRiepilogo` nella stessa transazione, così
// filtri, "Lavorazioni Esterne", avvisi di ritardo e KPI continuano a leggere da `schede`.

const SELECT_GIRO = `
  SELECT g.*, COALESCE(f.nome, '') AS fornitore_nome
  FROM schede_giri g
  LEFT JOIN fornitori f ON f.id = g.fornitore_id
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGiro(r: any, foto: { id: string; drive_file_id: string }[]): Giro {
  return {
    id: r.id,
    schedaId: r.scheda_id,
    ordine: r.ordine,
    fornitoreId: r.fornitore_id,
    fornitore: r.fornitore_nome ?? "",
    lavorazione: r.lavorazione,
    stato: r.stato,
    dataUscita: r.data_uscita ? dateToStr(r.data_uscita) : null,
    dataRientroPrevista: r.data_rientro_prevista ? dateToStr(r.data_rientro_prevista) : null,
    dataRientroEffettiva: r.data_rientro_effettiva ? dateToStr(r.data_rientro_effettiva) : null,
    note: r.note,
    foto: foto.map((f) => ({ id: f.id, name: "Foto", url: `/api/drive-file/${f.drive_file_id}` })),
  };
}

async function caricaGiri(rows: { id: string }[]): Promise<Giro[]> {
  if (rows.length === 0) return [];
  const { rows: foto } = await pool.query(
    `SELECT * FROM schede_giri_foto WHERE giro_id = ANY($1) ORDER BY giro_id, ordine`,
    [rows.map((r) => r.id)],
  );
  return rows.map((r) => mapGiro(r, foto.filter((f) => f.giro_id === r.id)));
}

export async function getGiriByScheda(schedaId: string): Promise<Giro[]> {
  const { rows } = await pool.query(`${SELECT_GIRO} WHERE g.scheda_id = $1 ORDER BY g.ordine`, [schedaId]);
  return caricaGiri(rows);
}

export async function getGiroById(id: string): Promise<Giro> {
  const { rows } = await pool.query(`${SELECT_GIRO} WHERE g.id = $1`, [id]);
  if (rows.length === 0) throw new Error(`Giro non trovato: ${id}`);
  return (await caricaGiri(rows))[0];
}

// Giro attivo: il più recente non ancora rientrato; se sono tutti rientrati, l'ultimo.
export async function getGiroAttivo(schedaId: string): Promise<Giro | null> {
  const { rows } = await pool.query(
    `${SELECT_GIRO} WHERE g.scheda_id = $1 ORDER BY (g.stato = 'Rientrato'), g.ordine DESC LIMIT 1`,
    [schedaId],
  );
  return rows.length ? (await caricaGiri(rows))[0] : null;
}

async function inTransazione<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Ricopia sulla Scheda i dati del giro attivo. Senza giri azzera i campi esterni. Il flag
// produzione_esterna si accende solo alla creazione di un giro (`attivaEsterna`) e non viene mai
// riabbassato qui se restano giri: molte schede storiche hanno dati esterni col flag spento e la
// UI le tratta già come esterne guardando anche lo Stato Produzione.
async function sincronizzaRiepilogo(client: PoolClient, schedaId: string, attivaEsterna = false): Promise<void> {
  const { rows } = await client.query(
    `SELECT * FROM schede_giri WHERE scheda_id = $1 ORDER BY (stato = 'Rientrato'), ordine DESC LIMIT 1`,
    [schedaId],
  );
  const g = rows[0];
  if (!g) {
    await client.query(
      `UPDATE schede SET produzione_esterna = false, fornitore_id = NULL, stato_prod_esterna = '',
         data_uscita_materiale = NULL, data_rientro_prevista = NULL, data_rientro_effettiva = NULL,
         aggiornato_il = now() WHERE id = $1`,
      [schedaId],
    );
    return;
  }
  await client.query(
    `UPDATE schede SET produzione_esterna = produzione_esterna OR $7, fornitore_id = $2, stato_prod_esterna = $3,
       data_uscita_materiale = $4, data_rientro_prevista = $5, data_rientro_effettiva = $6,
       aggiornato_il = now() WHERE id = $1`,
    [schedaId, g.fornitore_id, g.stato, g.data_uscita, g.data_rientro_prevista, g.data_rientro_effettiva, attivaEsterna],
  );
}

const vuoto = (v: string | null | undefined) => (v ? v : null);

export async function createGiro(schedaId: string, data: GiroInput): Promise<Giro> {
  const id = await inTransazione(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO schede_giri (scheda_id, ordine, fornitore_id, lavorazione, stato, data_uscita,
         data_rientro_prevista, data_rientro_effettiva, note)
       VALUES ($1, (SELECT COALESCE(MAX(ordine), 0) + 1 FROM schede_giri WHERE scheda_id = $1),
         $2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [schedaId, data.fornitoreId || null, data.lavorazione ?? "", data.stato ?? "Da Ordinare",
        vuoto(data.dataUscita), vuoto(data.dataRientroPrevista), vuoto(data.dataRientroEffettiva), data.note ?? ""],
    );
    await sincronizzaRiepilogo(client, schedaId, true);
    return rows[0].id as string;
  });
  return getGiroById(id);
}

const COLONNE: Record<keyof GiroInput, string> = {
  fornitoreId: "fornitore_id", lavorazione: "lavorazione", stato: "stato", dataUscita: "data_uscita",
  dataRientroPrevista: "data_rientro_prevista", dataRientroEffettiva: "data_rientro_effettiva", note: "note",
};

async function aggiornaGiro(client: PoolClient, id: string, data: GiroInput): Promise<string> {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const k of Object.keys(COLONNE) as (keyof GiroInput)[]) {
    if (data[k] === undefined) continue;
    const isData = k.startsWith("data");
    const valore = k === "fornitoreId" || isData ? vuoto(data[k] as string | null) : data[k];
    values.push(valore);
    sets.push(`${COLONNE[k]} = $${values.length}`);
  }
  sets.push("aggiornato_il = now()");
  values.push(id);
  const { rows } = await client.query(
    `UPDATE schede_giri SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING scheda_id`,
    values,
  );
  if (rows.length === 0) throw new Error(`Giro non trovato: ${id}`);
  const schedaId = rows[0].scheda_id as string;
  await sincronizzaRiepilogo(client, schedaId);
  return schedaId;
}

export async function updateGiro(id: string, data: GiroInput): Promise<Giro> {
  await inTransazione((client) => aggiornaGiro(client, id, data));
  return getGiroById(id);
}

// Il movimento in Ritiri e Consegne collegato resta, solo senza giro (ON DELETE SET NULL).
export async function deleteGiro(id: string): Promise<string> {
  return inTransazione(async (client) => {
    const { rows } = await client.query(`DELETE FROM schede_giri WHERE id = $1 RETURNING scheda_id`, [id]);
    if (rows.length === 0) throw new Error(`Giro non trovato: ${id}`);
    const schedaId = rows[0].scheda_id as string;
    await sincronizzaRiepilogo(client, schedaId);
    return schedaId;
  });
}

// Percorso di compatibilità per chi scrive ancora i campi esterni sulla Scheda (form Modifica,
// import PDF, creazione Scheda, rilavorazioni): la modifica va sul giro attivo, creandolo al
// primo dato. Non esiste un secondo giro "implicito": per aggiungerne uno serve createGiro.
export async function applicaDatiEsterniAlGiroAttivo(
  schedaId: string,
  patch: { fornitoreId?: string | null; statoProdEsterna?: string; dataUscitaMateriale?: string | null; dataRientroPrevista?: string | null; dataRientroEffettiva?: string | null },
): Promise<void> {
  const dati: GiroInput = {};
  if (patch.fornitoreId !== undefined) dati.fornitoreId = patch.fornitoreId;
  if (patch.statoProdEsterna !== undefined) dati.stato = patch.statoProdEsterna || "";
  if (patch.dataUscitaMateriale !== undefined) dati.dataUscita = patch.dataUscitaMateriale;
  if (patch.dataRientroPrevista !== undefined) dati.dataRientroPrevista = patch.dataRientroPrevista;
  if (patch.dataRientroEffettiva !== undefined) dati.dataRientroEffettiva = patch.dataRientroEffettiva;
  if (Object.keys(dati).length === 0) return;

  await inTransazione(async (client) => {
    const { rows } = await client.query(
      `SELECT id FROM schede_giri WHERE scheda_id = $1 ORDER BY (stato = 'Rientrato'), ordine DESC LIMIT 1`,
      [schedaId],
    );
    if (rows.length) {
      await aggiornaGiro(client, rows[0].id, dati);
      return;
    }
    // Nessun giro: lo creo solo se c'è almeno un valore da registrare (un form che azzera campi
    // già vuoti non deve inventare giri vuoti).
    if (!Object.values(dati).some((v) => !!v)) return;
    await client.query(
      `INSERT INTO schede_giri (scheda_id, ordine, fornitore_id, stato, data_uscita, data_rientro_prevista, data_rientro_effettiva)
       VALUES ($1, 1, $2, $3, $4, $5, $6)`,
      [schedaId, vuoto(dati.fornitoreId), dati.stato ?? "", vuoto(dati.dataUscita), vuoto(dati.dataRientroPrevista), vuoto(dati.dataRientroEffettiva)],
    );
    await sincronizzaRiepilogo(client, schedaId, true);
  });
}

// `soloAperto`: ignora il giro se è già rientrato (un nuovo movimento non deve riaprirlo).
export async function getGiroAttivoId(schedaId: string, soloAperto = false): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT id FROM schede_giri WHERE scheda_id = $1 ${soloAperto ? "AND stato <> 'Rientrato'" : ""}
     ORDER BY (stato = 'Rientrato'), ordine DESC LIMIT 1`,
    [schedaId],
  );
  return rows.length ? (rows[0].id as string) : null;
}

// Cambia lo stato di un giro (Consegna Fatta → "In Lavorazione", Ritiro Fatto o scansione QR →
// "Rientrato"), valorizzando la data di uscita/rientro effettivo se ancora vuota.
export async function impostaStatoGiro(giroId: string, stato: "In Lavorazione" | "Rientrato"): Promise<Giro> {
  await inTransazione(async (client) => {
    const { rows } = await client.query(
      `UPDATE schede_giri SET stato = $2,
         data_uscita = CASE WHEN $2 = 'In Lavorazione' THEN COALESCE(data_uscita, $3::date) ELSE data_uscita END,
         data_rientro_effettiva = CASE WHEN $2 = 'Rientrato' THEN COALESCE(data_rientro_effettiva, $3::date) ELSE data_rientro_effettiva END,
         aggiornato_il = now()
       WHERE id = $1 RETURNING scheda_id`,
      [giroId, stato, dataOggiRoma()],
    );
    if (rows.length === 0) throw new Error(`Giro non trovato: ${giroId}`);
    await sincronizzaRiepilogo(client, rows[0].scheda_id);
  });
  return getGiroById(giroId);
}

// Azioni da scansione QR sul giro attivo (uscita verso il fornitore / rientro in azienda). Oltre al
// giro aggiorna lo Stato Produzione della scheda: l'uscita la porta in "In lavorazione Esterna"
// (tranne se già chiusa o in attesa di rilavorazione), il rientro la riporta "In lavorazione" solo
// se era in "In lavorazione Esterna", senza toccare altri stati scelti a mano.
export async function segnaMovimentoGiro(giroId: string, azione: "uscita" | "rientro"): Promise<Giro> {
  const giro = await impostaStatoGiro(giroId, azione === "uscita" ? "In Lavorazione" : "Rientrato");
  if (azione === "uscita") {
    await pool.query(
      `UPDATE schede SET stato = 'In lavorazione Esterna', aggiornato_il = now()
       WHERE id = $1 AND stato NOT IN ('In lavorazione Esterna', 'Completato', 'Annullata', 'In Attesa Rilavorazione')`,
      [giro.schedaId],
    );
  } else {
    await pool.query(
      `UPDATE schede SET stato = 'In lavorazione', aggiornato_il = now() WHERE id = $1 AND stato = 'In lavorazione Esterna'`,
      [giro.schedaId],
    );
  }
  return giro;
}
