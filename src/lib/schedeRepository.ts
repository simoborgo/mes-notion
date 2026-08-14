import { pool, dateToStr } from "./db";
import type { Scheda, SchedaUpdate, OdpAttivo } from "./types";
import { STATI_CHIUSI_ODP } from "./types";
import { codiciSpecialiPerCommessa, ODP_SPECIALI } from "./attivitaSpecialiCommessa";
import { getCommesse, getCommessaFolderId, setCommessaFolderId } from "./commesseRepository";
import {
  getOrCreateCommessaFolder, getOrCreateSchedaFolder,
  uploadPdfAllegato as driveUploadPdfAllegato,
  uploadOrdineFornitore as driveUploadOrdineFornitore,
  uploadCopertina as driveUploadCopertina,
  uploadFoto as driveUploadFoto,
} from "./googleDriveSchede";

const SELECT = `
  SELECT s.*,
    c.numero_commessa AS commessa_nr,
    CASE WHEN c.id IS NOT NULL THEN c.numero_commessa || ' ' || c.cliente || ' - ' || c.localita ELSE '' END AS cliente_info,
    COALESCE(a.nome_arredo, '') AS area_label,
    COALESCE(f.nome, '') AS fornitore_nome
  FROM schede s
  LEFT JOIN commesse c ON c.id = s.commessa_id
  LEFT JOIN aree a ON a.id = s.area_id
  LEFT JOIN fornitori f ON f.id = s.fornitore_id
`;

function driveFileUrl(fileId: string): string {
  return `/api/drive-file/${fileId}`;
}
function legacyFileUrl(schedaId: string, prop: string, index: number): string {
  return `/api/files/${schedaId}?prop=${encodeURIComponent(prop)}&index=${index}`;
}

async function caricaAllegati(schedeIds: string[]) {
  if (schedeIds.length === 0) {
    return { pdfMap: new Map(), ofMap: new Map(), fotoMap: new Map() };
  }
  const [pdf, of_, foto] = await Promise.all([
    pool.query(`SELECT * FROM scheda_pdf_allegato WHERE scheda_id = ANY($1) ORDER BY scheda_id, ordine`, [schedeIds]),
    pool.query(`SELECT * FROM scheda_ordine_fornitore WHERE scheda_id = ANY($1) ORDER BY scheda_id, ordine`, [schedeIds]),
    pool.query(`SELECT * FROM scheda_foto WHERE scheda_id = ANY($1) ORDER BY scheda_id, ordine`, [schedeIds]),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const group = (rows: any[]) => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = map.get(r.scheda_id) ?? [];
      arr.push(r);
      map.set(r.scheda_id, arr);
    }
    return map;
  };
  return { pdfMap: group(pdf.rows), ofMap: group(of_.rows), fotoMap: group(foto.rows) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any, allegati: Awaited<ReturnType<typeof caricaAllegati>>): Scheda {
  const pdfRows = allegati.pdfMap.get(r.id) ?? [];
  const ofRows = allegati.ofMap.get(r.id) ?? [];
  const fotoRows = allegati.fotoMap.get(r.id) ?? [];

  const pdfAllegato = pdfRows.length > 0
    ? pdfRows.map((f: { drive_file_id: string; nome: string }) => ({ name: f.nome || "PDF Allegato", url: driveFileUrl(f.drive_file_id) }))
    : Array.from({ length: r.legacy_pdf_allegato_count ?? 0 }, (_, i) => ({ name: "PDF Allegato", url: legacyFileUrl(r.id, "PDF Allegato", i) }));

  const pdfOrdineFornitore = ofRows.length > 0
    ? ofRows.map((f: { drive_file_id: string; nome: string }) => ({ name: f.nome || "Ordine Fornitore", url: driveFileUrl(f.drive_file_id) }))
    : Array.from({ length: r.legacy_ordine_fornitore_count ?? 0 }, (_, i) => ({ name: "Ordine Fornitore", url: legacyFileUrl(r.id, "Ordine Fornitore", i) }));

  const foto = fotoRows.length > 0
    ? fotoRows.map((f: { drive_file_id: string }) => ({ name: "Foto", url: driveFileUrl(f.drive_file_id) }))
    : Array.from({ length: r.legacy_foto_count ?? 0 }, (_, i) => ({ name: "Foto", url: legacyFileUrl(r.id, "Foto", i) }));

  const copertina = r.copertina_drive_id
    ? driveFileUrl(r.copertina_drive_id)
    : (r.legacy_copertina ? legacyFileUrl(r.id, "Copertina", 0) : null);

  return {
    id: r.id,
    odp: r.odp,
    clienteInfo: r.cliente_info ?? "",
    numeroScheda: r.numero_scheda,
    descrizioneFasi: r.descrizione_fasi,
    codiceArticolo: r.codice_articolo,
    posizione: r.posizione,
    quantita: r.quantita != null ? Number(r.quantita) : null,
    tipologia: r.tipologia,
    statoProduzione: r.stato,
    faseCorrente: r.fase_corrente,
    dataSchedaRicevuta: r.data_scheda_ricevuta ? dateToStr(r.data_scheda_ricevuta) : null,
    dataProduzionePrevista: r.data_produzione_prevista ? dateToStr(r.data_produzione_prevista) : null,
    pdfAllegato,
    foto,
    produzioneEsterna: r.produzione_esterna,
    statoProdEsterna: r.stato_prod_esterna,
    fornitore: r.fornitore_nome ?? "",
    fornitoreId: r.fornitore_id,
    ordineFornitore: "",
    pdfOrdineFornitore,
    dataRientroPrevista: r.data_rientro_prevista ? dateToStr(r.data_rientro_prevista) : null,
    dataUscitaMateriale: r.data_uscita_materiale ? dateToStr(r.data_uscita_materiale) : null,
    dataRientroEffettiva: r.data_rientro_effettiva ? dateToStr(r.data_rientro_effettiva) : null,
    copertina,
    note: r.descrizione_fasi,
    commessaId: r.commessa_id,
    commessaNr: r.commessa_nr ?? "",
    areaId: r.area_id,
    areaLabel: r.area_label ?? "",
    parentId: r.parent_id,
    notionUrl: "",
    kitFerramenta: r.kit_ferramenta,
    noteStato: r.note_stato,
  };
}

async function mapRows(rows: unknown[]): Promise<Scheda[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ids = (rows as any[]).map(r => r.id);
  const allegati = await caricaAllegati(ids);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows as any[]).map(r => mapRow(r, allegati));
}

export async function getSchede(): Promise<Scheda[]> {
  const { rows } = await pool.query(`${SELECT} WHERE s.tipologia = 'Scheda' AND s.archiviata = false ORDER BY s.odp DESC`);
  return mapRows(rows);
}

// ODP "avviati" (non chiusi) — usata da Kit Ferramenta e Fogli di scarico
export async function getSchedeOdpAvviate(): Promise<Scheda[]> {
  const schede = await getSchede();
  return schede.filter(s => !STATI_CHIUSI_ODP.includes(s.statoProduzione) && !!s.odp);
}

export async function getSottoschede(): Promise<Scheda[]> {
  const { rows } = await pool.query(`${SELECT} WHERE s.tipologia <> 'Scheda' AND s.archiviata = false`);
  return mapRows(rows);
}

export async function getSchedaById(id: string): Promise<Scheda> {
  const { rows } = await pool.query(`${SELECT} WHERE s.id = $1`, [id]);
  if (rows.length === 0) throw new Error(`Scheda non trovata: ${id}`);
  return (await mapRows(rows))[0];
}

export async function getSchedeByArea(areaId: string): Promise<Scheda[]> {
  const { rows } = await pool.query(`${SELECT} WHERE s.area_id = $1 AND s.tipologia = 'Scheda' AND s.archiviata = false`, [areaId]);
  return mapRows(rows);
}

export async function getSchedeByCommessa(commessaId: string): Promise<Scheda[]> {
  const { rows } = await pool.query(`${SELECT} WHERE s.commessa_id = $1 AND s.tipologia = 'Scheda' AND s.archiviata = false`, [commessaId]);
  return mapRows(rows);
}

// ODP attivi per l'autocomplete di Rilevamento Ore + codici speciali indiretti — stessa logica
// già in vigore su Notion (vedi notion.ts), solo su query SQL invece di full-table Notion.
export async function getOdpAttivi(): Promise<OdpAttivo[]> {
  const [schede, commesse] = await Promise.all([getSchede(), getCommesse()]);
  const statoCommessaById = new Map(commesse.map(c => [c.id, c.stato]));
  const specialiCommessa: OdpAttivo[] = commesse
    .filter(c => c.numeroCommessa && c.stato !== "Chiusa")
    .flatMap(c => codiciSpecialiPerCommessa(c.numeroCommessa, c.cliente).map(s => ({
      id: null,
      odp: s.odp,
      label: s.label,
      commessaNr: c.numeroCommessa,
      isSpeciale: true,
    })));

  const vistiOdp = new Set<string>();
  const attivi: OdpAttivo[] = [];
  for (const s of schede) {
    if (!s.odp || vistiOdp.has(s.odp)) continue;
    if (s.statoProduzione === "Annullata") continue;
    if (s.commessaId && statoCommessaById.get(s.commessaId) === "Chiusa") continue;
    vistiOdp.add(s.odp);
    attivi.push({
      id: s.id,
      odp: s.odp,
      label: s.clienteInfo ? `${s.odp} — ${s.clienteInfo}` : s.odp,
      numeroScheda: s.numeroScheda || undefined,
      clienteInfo: s.clienteInfo || undefined,
      codiceArticolo: s.codiceArticolo || undefined,
      commessaNr: s.commessaNr || undefined,
      copertina: s.copertina,
      isSpeciale: false,
    });
  }

  const speciali: OdpAttivo[] = ODP_SPECIALI.map(s => ({
    id: null,
    odp: s.prefix,
    label: `${s.prefix} — ${s.label}`,
    isSpeciale: true,
  }));
  return [...attivi, ...speciali, ...specialiCommessa];
}

// Usata da registraChiusuraOdp (standardRepartoRepository.ts) per risolvere il Codice Articolo di
// un ODP dato solo il testo — approssimazione già accettata: se più Schede condividono lo stesso
// ODP (padre + sottoschede), prende la prima trovata.
export async function getCodiceArticoloPerOdp(odp: string): Promise<string | null> {
  const { rows } = await pool.query(`SELECT codice_articolo FROM schede WHERE odp = $1 LIMIT 1`, [odp]);
  return rows[0]?.codice_articolo || null;
}

export async function getNextOdp(): Promise<string> {
  const year = new Date().getFullYear().toString().slice(2);
  const prefix = `MP${year}-`;
  const { rows } = await pool.query(
    `SELECT odp FROM schede WHERE tipologia = 'Scheda' AND odp LIKE $1 ORDER BY odp DESC LIMIT 1`,
    [`${prefix}%`],
  );
  const maxNum = rows[0] ? parseInt(rows[0].odp.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
}

export async function getNextRilavorazioneOdp(_parentId: string, parentOdp: string): Promise<string> {
  const prefix = `${parentOdp}/R`;
  const { rows } = await pool.query(
    `SELECT odp FROM schede WHERE tipologia = 'Rilavorazione' AND odp LIKE $1`,
    [`${prefix}%`],
  );
  const maxN = rows.reduce((max: number, r: { odp: string }) => {
    const m = r.odp.match(/\/R(\d+)$/);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  return `${parentOdp}/R${String(maxN + 1).padStart(2, "0")}`;
}

export async function createSchedaPage({
  numeroScheda, commessaId, odp, tipologia = "Scheda", stato, codiceArticolo, posizione,
  fornitoreId, quantita, dataProduzionePrevista, dataSchedaRicevuta, produzioneEsterna,
  dataRientroPrevista, note, parentId,
  pdfBuffer, pdfFilename, thumbnailBuffer, thumbnailFilename,
}: {
  numeroScheda: string;
  commessaId: string | null;
  odp: string;
  tipologia?: string;
  stato?: string;
  codiceArticolo?: string | null;
  posizione?: string | null;
  fornitore?: string | null; // ignorato: "Nome Fornitore" era una rollup non scrivibile su Notion, il nome si legge dalla FK fornitoreId
  fornitoreId?: string | null;
  quantita?: number | null;
  dataProduzionePrevista?: string | null;
  dataSchedaRicevuta?: string | null;
  produzioneEsterna?: boolean;
  dataRientroPrevista?: string | null;
  note?: string | null;
  parentId?: string | null;
  pdfBuffer?: Buffer;
  pdfFilename?: string;
  thumbnailBuffer?: Buffer;
  thumbnailFilename?: string;
}): Promise<Scheda> {
  const { rows } = await pool.query(
    `INSERT INTO schede (id, numero_scheda, commessa_id, odp, tipologia, stato, codice_articolo, posizione,
       fornitore_id, quantita, data_produzione_prevista, data_scheda_ricevuta, produzione_esterna,
       data_rientro_prevista, descrizione_fasi, parent_id)
     VALUES (gen_random_uuid(), $1,$2,$3,$4,COALESCE($5,'Da Iniziare'),$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    [
      numeroScheda, commessaId, odp, tipologia, stato || null, codiceArticolo || "", posizione || "",
      fornitoreId || null, quantita ?? null, dataProduzionePrevista || null, dataSchedaRicevuta || null,
      produzioneEsterna ?? false, dataRientroPrevista || null, note || "", parentId || null,
    ],
  );
  const id = rows[0].id as string;

  if (pdfBuffer && pdfFilename) {
    const folderId = await resolveSchedaFolder(id);
    const uploaded = await driveUploadPdfAllegato(folderId, pdfBuffer, pdfFilename);
    await pool.query(
      `INSERT INTO scheda_pdf_allegato (scheda_id, drive_file_id, nome, ordine) VALUES ($1,$2,$3,0)`,
      [id, uploaded.id, pdfFilename],
    );
  }
  if (thumbnailBuffer && thumbnailFilename) {
    const folderId = await resolveSchedaFolder(id);
    const mimeType = thumbnailFilename.endsWith(".png") ? "image/png" : "image/jpeg";
    const uploaded = await driveUploadCopertina(folderId, thumbnailBuffer, mimeType);
    await pool.query(`UPDATE schede SET copertina_drive_id = $1 WHERE id = $2`, [uploaded.id, id]);
  }

  return getSchedaById(id);
}

export async function updateScheda(id: string, data: SchedaUpdate): Promise<Scheda> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (data.statoProduzione !== undefined) { sets.push(`stato = $${i++}`); values.push(data.statoProduzione); }
  if (data.dataProduzionePrevista !== undefined) { sets.push(`data_produzione_prevista = $${i++}`); values.push(data.dataProduzionePrevista); }
  if (data.produzioneEsterna !== undefined) { sets.push(`produzione_esterna = $${i++}`); values.push(data.produzioneEsterna); }
  if (data.statoProdEsterna !== undefined) { sets.push(`stato_prod_esterna = $${i++}`); values.push(data.statoProdEsterna || ""); }
  if (data.dataRientroPrevista !== undefined) { sets.push(`data_rientro_prevista = $${i++}`); values.push(data.dataRientroPrevista); }
  if (data.dataUscitaMateriale !== undefined) { sets.push(`data_uscita_materiale = $${i++}`); values.push(data.dataUscitaMateriale); }
  if (data.dataRientroEffettiva !== undefined) { sets.push(`data_rientro_effettiva = $${i++}`); values.push(data.dataRientroEffettiva); }
  if (data.note !== undefined) { sets.push(`descrizione_fasi = $${i++}`); values.push(data.note); }
  if (data.codiceArticolo !== undefined) { sets.push(`codice_articolo = $${i++}`); values.push(data.codiceArticolo); }
  if (data.posizione !== undefined) { sets.push(`posizione = $${i++}`); values.push(data.posizione); }
  if (data.quantita !== undefined) { sets.push(`quantita = $${i++}`); values.push(data.quantita); }
  if (data.dataSchedaRicevuta !== undefined) { sets.push(`data_scheda_ricevuta = $${i++}`); values.push(data.dataSchedaRicevuta); }
  if (data.noteStato !== undefined) { sets.push(`note_stato = $${i++}`); values.push(data.noteStato); }
  // fornitore (testo) ignorato: "Nome Fornitore" non era mai scrivibile nemmeno su Notion (rollup),
  // l'unico modo reale è la FK fornitoreId sotto.
  if (data.fornitoreId !== undefined) { sets.push(`fornitore_id = $${i++}`); values.push(data.fornitoreId); }
  sets.push(`aggiornato_il = now()`);

  values.push(id);
  const { rows } = await pool.query(`UPDATE schede SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`, values);
  if (rows.length === 0) throw new Error(`Scheda non trovata: ${id}`);
  return getSchedaById(id);
}

export async function updateSchedaStato(id: string, stato: string): Promise<void> {
  await pool.query(`UPDATE schede SET stato = $1, aggiornato_il = now() WHERE id = $2`, [stato, id]);
}

// Ritiro → Fatto: materiale rientrato dal fornitore
export async function updateSchedaRientrato(id: string): Promise<void> {
  await pool.query(
    `UPDATE schede SET stato = 'In lavorazione', stato_prod_esterna = 'Rientrato', aggiornato_il = now() WHERE id = $1`,
    [id],
  );
}

// Ritiro rilavorazione → Fatto: pezzo tornato fisicamente, in attesa di verifica
export async function updateRilavorazioneRientrata(id: string): Promise<void> {
  await pool.query(`UPDATE schede SET stato_prod_esterna = 'Rientrato', aggiornato_il = now() WHERE id = $1`, [id]);
}

// Consegna → Fatto: materiale consegnato al fornitore, ora in lavorazione
export async function updateSchedaConsegnaFatta(id: string): Promise<void> {
  await pool.query(`UPDATE schede SET stato_prod_esterna = 'In Lavorazione', aggiornato_il = now() WHERE id = $1`, [id]);
}

export async function updateSchedaKitFerramenta(id: string, stato: "Si" | "No" | null): Promise<Scheda> {
  await pool.query(`UPDATE schede SET kit_ferramenta = $1, aggiornato_il = now() WHERE id = $2`, [stato ?? "", id]);
  return getSchedaById(id);
}

export async function updateSchedaKitFerramentaDescrizione(id: string, descrizione: string): Promise<void> {
  await pool.query(`UPDATE schede SET descrizione_kit_ferramenta = $1, aggiornato_il = now() WHERE id = $2`, [descrizione, id]);
}

// Soft-delete, stesso pattern già in uso su Notion: la riga resta recuperabile via getSchedaById
// (usata da Kit Ferramenta/Ritiri/Verifiche che referenziano l'id), sparisce solo dalle liste.
export async function archiveScheda(id: string): Promise<void> {
  await pool.query(`UPDATE schede SET archiviata = true, aggiornato_il = now() WHERE id = $1`, [id]);
}

// ── Drive: risoluzione cartella Commessa/MP ─────────────────────────────────────────────────────
// Esportata: riusata da ritiriRepository per le Foto dei Ritiri collegati a una Scheda, che
// finiscono nella stessa cartella MP invece di una struttura Drive separata.
export async function resolveSchedaFolder(schedaId: string): Promise<string> {
  const { rows } = await pool.query(
    `SELECT s.odp, s.commessa_id, c.numero_commessa, c.cliente, c.localita
     FROM schede s LEFT JOIN commesse c ON c.id = s.commessa_id
     WHERE s.id = $1`,
    [schedaId],
  );
  if (rows.length === 0) throw new Error(`Scheda non trovata: ${schedaId}`);
  const r = rows[0];

  let commessaFolderId: string | null = null;
  if (r.commessa_id) {
    commessaFolderId = await getCommessaFolderId(r.commessa_id);
    if (!commessaFolderId) {
      commessaFolderId = await getOrCreateCommessaFolder({ numeroCommessa: r.numero_commessa, cliente: r.cliente, localita: r.localita });
      await setCommessaFolderId(r.commessa_id, commessaFolderId);
    }
  }
  // Scheda senza Commessa collegata (raro): la cartella MP finisce direttamente nella root, per
  // non far fallire l'upload — meglio recuperabile a mano che perso.
  const parentFolderId = commessaFolderId ?? process.env.COMMESSE_DRIVE_FOLDER_ID!;
  return getOrCreateSchedaFolder(parentFolderId, r.odp);
}

function decodeBase64File(base64: string): { buffer: Buffer; mimeType: string } {
  const match = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("File non valido");
  return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
}

// ── File: PDF Allegato / Ordine Fornitore / Foto (liste additive) / Copertina (sostituisce) ────
export async function appendPdfAllegatoToScheda(schedaId: string, pdfBase64: string, filename: string): Promise<void> {
  const { buffer } = decodeBase64File(pdfBase64);
  const folderId = await resolveSchedaFolder(schedaId);
  const { rows } = await pool.query(`SELECT COALESCE(MAX(ordine), -1) + 1 AS next FROM scheda_pdf_allegato WHERE scheda_id = $1`, [schedaId]);
  const ordine = rows[0].next as number;
  const uploaded = await driveUploadPdfAllegato(folderId, buffer, filename);
  await pool.query(
    `INSERT INTO scheda_pdf_allegato (scheda_id, drive_file_id, nome, ordine) VALUES ($1,$2,$3,$4)`,
    [schedaId, uploaded.id, filename, ordine],
  );
}

export async function appendOrdineFornitoreToScheda(schedaId: string, pdfBase64: string, filename: string): Promise<void> {
  const { buffer } = decodeBase64File(pdfBase64);
  const folderId = await resolveSchedaFolder(schedaId);
  const { rows } = await pool.query(`SELECT COALESCE(MAX(ordine), -1) + 1 AS next FROM scheda_ordine_fornitore WHERE scheda_id = $1`, [schedaId]);
  const ordine = rows[0].next as number;
  const uploaded = await driveUploadOrdineFornitore(folderId, buffer, filename);
  await pool.query(
    `INSERT INTO scheda_ordine_fornitore (scheda_id, drive_file_id, nome, ordine) VALUES ($1,$2,$3,$4)`,
    [schedaId, uploaded.id, filename, ordine],
  );
}

export async function appendFotoToPage(schedaId: string, fotoBase64Array: string[]): Promise<void> {
  if (!fotoBase64Array.length) return;
  const folderId = await resolveSchedaFolder(schedaId);
  const { rows } = await pool.query(`SELECT COALESCE(MAX(ordine), -1) + 1 AS next FROM scheda_foto WHERE scheda_id = $1`, [schedaId]);
  let ordine = rows[0].next as number;

  for (const base64 of fotoBase64Array) {
    const match = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) continue;
    const mimeType = match[1];
    const buffer = Buffer.from(match[2], "base64");
    const uploaded = await driveUploadFoto(folderId, buffer, ordine, mimeType);
    await pool.query(`INSERT INTO scheda_foto (scheda_id, drive_file_id, ordine) VALUES ($1,$2,$3)`, [schedaId, uploaded.id, ordine]);
    ordine++;
  }
}

// Sostituisce (non aggiunge) la Copertina — è un'immagine di anteprima singola, non un elenco.
export async function updateCopertinaScheda(schedaId: string, imageBase64: string, filename: string): Promise<void> {
  const { buffer, mimeType } = decodeBase64File(imageBase64);
  void filename;
  const folderId = await resolveSchedaFolder(schedaId);
  const uploaded = await driveUploadCopertina(folderId, buffer, mimeType);
  await pool.query(`UPDATE schede SET copertina_drive_id = $1, aggiornato_il = now() WHERE id = $2`, [uploaded.id, schedaId]);
}
