import { pool, dateToStr } from "./db";
import type { Ritiro, RitiroUpdate, Scheda } from "./types";
import { resolveSchedaFolder, getSchedaById, createSchedaPage, updateSchedaStato, getNextRilavorazioneOdp } from "./schedeRepository";
import { uploadFotoRitiro as driveUploadFotoRitiro, getOrCreateCommessaFolder } from "./googleDriveSchede";
import { getCommessaFolderId, setCommessaFolderId, getCommessaById } from "./commesseRepository";
import { findFornitoreIdByName } from "./fornitoriRepository";

// "ODP"/"Nr Commessa"/"Ordine Fornitore" su Ritiro erano rollup Notion dalla Scheda collegata
// (relation "Scheda", verificato via schema Notion reale) — mai colonne proprie, quindi qui sono
// sempre derivate con una JOIN verso schede/commesse/scheda_ordine_fornitore, mai lette da
// Notion. "Nr Commessa" segue esattamente la stessa semantica del rollup originale: solo se il
// Ritiro ha una Scheda collegata (mai dalla relation "Commessa" diretta, che il rollup ignorava).
const SELECT = `
  SELECT r.*,
    s.odp AS numero_ordine,
    s.legacy_ordine_fornitore_count AS scheda_legacy_of_count,
    sc.numero_commessa AS commessa_nr,
    COALESCE(f.nome, '') AS fornitore_nome
  FROM ritiri r
  LEFT JOIN schede s ON s.id = r.scheda_id
  LEFT JOIN commesse sc ON sc.id = s.commessa_id
  LEFT JOIN fornitori f ON f.id = r.fornitore_id
`;

function driveFileUrl(fileId: string): string {
  return `/api/drive-file/${fileId}`;
}
function legacyFileUrl(pageId: string, prop: string, index: number): string {
  return `/api/files/${pageId}?prop=${encodeURIComponent(prop)}&index=${index}`;
}

async function caricaAllegati(ritiriIds: string[], schedaIds: string[]) {
  const [foto, of_] = await Promise.all([
    ritiriIds.length ? pool.query(`SELECT * FROM ritiro_foto WHERE ritiro_id = ANY($1) ORDER BY ritiro_id, ordine`, [ritiriIds]) : { rows: [] },
    schedaIds.length ? pool.query(`SELECT * FROM scheda_ordine_fornitore WHERE scheda_id = ANY($1) ORDER BY scheda_id, ordine`, [schedaIds]) : { rows: [] },
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const group = (rows: any[], key: string) => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = map.get(r[key]) ?? [];
      arr.push(r);
      map.set(r[key], arr);
    }
    return map;
  };
  return { fotoMap: group(foto.rows, "ritiro_id"), ofMap: group(of_.rows, "scheda_id") };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any, allegati: Awaited<ReturnType<typeof caricaAllegati>>): Ritiro {
  const ofRows = r.scheda_id ? (allegati.ofMap.get(r.scheda_id) ?? []) : [];
  const ordineFornitore = ofRows.length > 0
    ? ofRows.map((f: { drive_file_id: string; nome: string }) => ({ name: f.nome || "Ordine Fornitore", url: driveFileUrl(f.drive_file_id) }))
    : Array.from({ length: r.scheda_id ? (r.scheda_legacy_of_count ?? 0) : 0 }, (_, i) => ({ name: "Ordine Fornitore", url: legacyFileUrl(r.scheda_id, "Ordine Fornitore", i) }));

  const fotoRows = allegati.fotoMap.get(r.id) ?? [];
  const foto = fotoRows.length > 0
    ? fotoRows.map((f: { drive_file_id: string }) => ({ name: "Foto", url: driveFileUrl(f.drive_file_id) }))
    : Array.from({ length: r.legacy_foto_count ?? 0 }, (_, i) => ({ name: "Foto", url: legacyFileUrl(r.id, "Foto", i) }));

  return {
    id: r.id,
    causale: r.descrizione,
    numeroOrdine: r.numero_ordine ?? "",
    numeroOrdineId: r.scheda_id,
    rilavorazioneId: r.rilavorazione_id,
    commessaId: r.commessa_id,
    commessaNr: r.commessa_nr ?? "",
    descrizioneMerce: r.descrizione,
    dataTrasporto: r.data_trasporto ? dateToStr(r.data_trasporto) : null,
    dataFatto: r.data_fatto ? dateToStr(r.data_fatto) : null,
    tipoMovimento: r.tipo_movimento,
    stato: r.stato,
    urgenza: r.urgenza,
    nc: r.nc,
    nrCollo: r.nr_collo,
    totColli: r.tot_colli,
    fornitore: r.fornitore_nome ?? "",
    fornitoreId: r.fornitore_id,
    ordineFornitore,
    note: r.descrizione,
    documentiAllegati: [],
    pdfScheda: [],
    pdfOrdineFornitore: [],
    foto,
    notionUrl: "",
  };
}

async function mapRows(rows: unknown[]): Promise<Ritiro[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rr = rows as any[];
  const ritiriIds = rr.map(r => r.id);
  const schedaIds = [...new Set(rr.map(r => r.scheda_id).filter(Boolean))] as string[];
  const allegati = await caricaAllegati(ritiriIds, schedaIds);
  return rr.map(r => mapRow(r, allegati));
}

export async function getRitiri(): Promise<Ritiro[]> {
  const { rows } = await pool.query(`${SELECT} WHERE r.archiviato = false ORDER BY r.data_trasporto DESC NULLS LAST, r.creato_il DESC`);
  return mapRows(rows);
}

export async function getRitiroById(id: string): Promise<Ritiro> {
  const { rows } = await pool.query(`${SELECT} WHERE r.id = $1`, [id]);
  if (rows.length === 0) throw new Error(`Ritiro non trovato: ${id}`);
  return (await mapRows(rows))[0];
}

export async function getRitiriByScheda(schedaId: string): Promise<Ritiro[]> {
  const { rows } = await pool.query(`${SELECT} WHERE r.scheda_id = $1 AND r.archiviato = false`, [schedaId]);
  return mapRows(rows);
}

export async function createRitiro({
  causale,
  tipoMovimento,
  dataTrasporto,
  urgenza,
  nc,
  nrCollo,
  totColli,
  schedaId,
  fornitoreId,
  rilavorazioneId,
  commessaId,
}: {
  causale: string;
  tipoMovimento?: string;
  dataTrasporto?: string | null;
  urgenza?: boolean;
  nc?: boolean;
  nrCollo?: number | null;
  totColli?: number | null;
  schedaId?: string | null;
  fornitoreId?: string | null;
  rilavorazioneId?: string | null;
  commessaId?: string | null;
}): Promise<Ritiro> {
  const { rows } = await pool.query(
    `INSERT INTO ritiri (id, descrizione, tipo_movimento, data_trasporto, urgenza, nc, nr_collo, tot_colli,
       scheda_id, fornitore_id, rilavorazione_id, commessa_id)
     VALUES (gen_random_uuid(), $1, COALESCE($2,''), $3, COALESCE($4,false), COALESCE($5,false), $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [causale, tipoMovimento || null, dataTrasporto || null, urgenza ?? false, nc ?? false, nrCollo ?? null,
     totColli ?? null, schedaId || null, fornitoreId || null, rilavorazioneId || null, commessaId || null],
  );
  return getRitiroById(rows[0].id as string);
}

// Logica condivisa di creazione rilavorazione: usata dal wizard (scheda dettaglio) e dallo
// shortcut NC in Carico Magazzino. Crea la scheda figlia, sblocca lo stato del padre ("In Attesa
// Rilavorazione") ed eventualmente crea la Consegna collegata. Vive qui (non in
// schedeRepository) perché crea anche il Ritiro — schedeRepository resta a senso unico verso
// ritiriRepository (via resolveSchedaFolder), mai il contrario.
export async function createRilavorazione({
  parentId,
  descrizione,
  fornitoreNome,
  fornitoreId: fornitoreIdOverride,
  note,
  dataRientro,
  quantita,
  creaRitiro,
  parent: parentOverride,
}: {
  parentId: string;
  descrizione: string;
  fornitoreNome?: string | null;
  fornitoreId?: string | null;
  note?: string | null;
  dataRientro?: string | null;
  quantita?: number | null;
  creaRitiro?: boolean;
  parent?: Scheda;
}): Promise<{ rilavorazione: Scheda; subOdp: string; parent: Scheda; ritiro: Ritiro | null; ritiroError?: string }> {
  const parent = parentOverride ?? await getSchedaById(parentId);

  const [subOdp, fornitoreId] = await Promise.all([
    getNextRilavorazioneOdp(parentId, parent.odp),
    fornitoreIdOverride
      ? Promise.resolve(fornitoreIdOverride)
      : fornitoreNome ? findFornitoreIdByName(fornitoreNome) : Promise.resolve(null),
  ]);

  const rilavorazione = await createSchedaPage({
    numeroScheda: descrizione,
    commessaId: parent.commessaId,
    odp: subOdp,
    tipologia: "Rilavorazione",
    stato: "In lavorazione Esterna",
    fornitore: fornitoreNome ?? null,
    fornitoreId,
    note: note ?? null,
    dataProduzionePrevista: dataRientro ?? null,
    // Una Rilavorazione è per definizione fuori sede (dal fornitore) — senza questo flag
    // l'alert "rientro in ritardo" già esistente per le Schede normali non scatta mai qui,
    // e il filtro "Produzione Esterna" in Tabella Schede le esclude sempre.
    produzioneEsterna: true,
    dataRientroPrevista: dataRientro ?? null,
    quantita: quantita ?? parent.quantita ?? null,
    parentId,
  });

  await updateSchedaStato(parentId, "In Attesa Rilavorazione");

  let ritiro: Ritiro | null = null;
  let ritiroError: string | undefined;
  if (creaRitiro && fornitoreId) {
    try {
      ritiro = await createRitiro({
        causale: `Rilavorazione — ${subOdp}`,
        tipoMovimento: "Consegna",
        dataTrasporto: dataRientro ?? new Date().toISOString().slice(0, 10),
        schedaId: rilavorazione.id,
        fornitoreId,
        rilavorazioneId: rilavorazione.id,
      });
    } catch (e) {
      console.error("[createRilavorazione] createRitiro:", e);
      ritiroError = (e as Error).message;
    }
  }

  return { rilavorazione, subOdp, parent, ritiro, ritiroError };
}

export async function updateRitiro(id: string, data: RitiroUpdate): Promise<Ritiro> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (data.causale) { sets.push(`descrizione = $${i++}`); values.push(data.causale); }
  else if (data.descrizioneMerce) { sets.push(`descrizione = $${i++}`); values.push(data.descrizioneMerce); }
  if (data.dataTrasporto !== undefined) { sets.push(`data_trasporto = $${i++}`); values.push(data.dataTrasporto); }
  if (data.tipoMovimento !== undefined) { sets.push(`tipo_movimento = $${i++}`); values.push(data.tipoMovimento || ""); }
  if (data.stato) {
    sets.push(`stato = $${i++}`); values.push(data.stato);
    sets.push(`data_fatto = ${data.stato === "Fatto" ? "CURRENT_DATE" : "NULL"}`);
  }
  if (data.urgenza !== undefined) { sets.push(`urgenza = $${i++}`); values.push(data.urgenza); }
  if (data.nc !== undefined) { sets.push(`nc = $${i++}`); values.push(data.nc); }
  if (data.nrCollo !== undefined) { sets.push(`nr_collo = $${i++}`); values.push(data.nrCollo ?? null); }
  if (data.totColli !== undefined) { sets.push(`tot_colli = $${i++}`); values.push(data.totColli ?? null); }
  if (data.schedaId !== undefined) { sets.push(`scheda_id = $${i++}`); values.push(data.schedaId || null); }
  if (data.fornitoreId !== undefined) { sets.push(`fornitore_id = $${i++}`); values.push(data.fornitoreId || null); }
  if (data.commessaId !== undefined) { sets.push(`commessa_id = $${i++}`); values.push(data.commessaId || null); }
  if (data.rilavorazioneId !== undefined) { sets.push(`rilavorazione_id = $${i++}`); values.push(data.rilavorazioneId || null); }
  sets.push(`aggiornato_il = now()`);

  values.push(id);
  const { rows } = await pool.query(`UPDATE ritiri SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`, values);
  if (rows.length === 0) throw new Error(`Ritiro non trovato: ${id}`);
  return getRitiroById(id);
}

// Soft-delete, stesso pattern già in uso su Notion (archived: true): la riga resta recuperabile
// via getRitiroById, sparisce solo dalle liste.
export async function deleteRitiro(id: string): Promise<void> {
  await pool.query(`UPDATE ritiri SET archiviato = true, aggiornato_il = now() WHERE id = $1`, [id]);
}

// Cartella Drive di destinazione per le Foto di un Ritiro: la cartella MP della Scheda collegata
// se presente (stesso home dei file della Scheda stessa), altrimenti la cartella della Commessa
// diretta, altrimenti la root Commesse (best-effort, mai bloccante — vedi resolveSchedaFolder).
async function resolveRitiroFolder(schedaId: string | null, commessaId: string | null): Promise<string> {
  if (schedaId) return resolveSchedaFolder(schedaId);
  if (commessaId) {
    let folderId = await getCommessaFolderId(commessaId);
    if (!folderId) {
      const commessa = await getCommessaById(commessaId);
      folderId = await getOrCreateCommessaFolder({ numeroCommessa: commessa.numeroCommessa, cliente: commessa.cliente, localita: commessa.localita });
      await setCommessaFolderId(commessaId, folderId);
    }
    return folderId;
  }
  return process.env.COMMESSE_DRIVE_FOLDER_ID!;
}

function decodeBase64File(base64: string): { buffer: Buffer; mimeType: string } {
  const match = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("File non valido");
  return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
}

export async function appendFotoToRitiro(ritiroId: string, fotoBase64Array: string[]): Promise<void> {
  if (!fotoBase64Array.length) return;
  const { rows } = await pool.query(`SELECT scheda_id, commessa_id FROM ritiri WHERE id = $1`, [ritiroId]);
  if (rows.length === 0) throw new Error(`Ritiro non trovato: ${ritiroId}`);
  const folderId = await resolveRitiroFolder(rows[0].scheda_id, rows[0].commessa_id);

  const { rows: nextRows } = await pool.query(`SELECT COALESCE(MAX(ordine), -1) + 1 AS next FROM ritiro_foto WHERE ritiro_id = $1`, [ritiroId]);
  let ordine = nextRows[0].next as number;

  for (const base64 of fotoBase64Array) {
    const { buffer, mimeType } = decodeBase64File(base64);
    const uploaded = await driveUploadFotoRitiro(folderId, buffer, ordine, mimeType);
    await pool.query(`INSERT INTO ritiro_foto (ritiro_id, drive_file_id, ordine) VALUES ($1,$2,$3)`, [ritiroId, uploaded.id, ordine]);
    ordine++;
  }
}
