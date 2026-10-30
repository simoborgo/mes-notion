import { pool, dateToStr } from "./db";
import type { Commessa, CommessaUpdate } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): Commessa {
  return {
    id: r.id,
    numeroCommessa: r.numero_commessa,
    cliente: r.cliente,
    localita: r.localita,
    info: r.info,
    responsabile: r.responsabile,
    stato: r.stato,
    dataCarico: r.data_carico_eff ? dateToStr(r.data_carico_eff) : null,
    dataCaricoDaCarichi: !!r.ha_carichi,
    inizioMontaggio: r.inizio_montaggio ? dateToStr(r.inizio_montaggio) : null,
    fineMontaggio: r.fine_montaggio ? dateToStr(r.fine_montaggio) : null,
    giorniMontaggio: r.giorni_montaggio != null ? Number(r.giorni_montaggio) : null,
    inizioProduzione: r.inizio_produzione ? dateToStr(r.inizio_produzione) : null,
    fineProduzione: r.fine_produzione ? dateToStr(r.fine_produzione) : null,
    notionUrl: "",
  };
}

// data_carico_eff: la data di carico della commessa è derivata dai suoi carichi (prossimo carico da
// oggi in avanti, altrimenti l'ultimo); solo senza carichi vale il valore manuale della colonna.
// Calcolata in lettura, così non può andare fuori sync né invecchiare con il passare dei giorni.
const SELECT = `SELECT c.*, (c.fine_montaggio - c.inizio_montaggio) AS giorni_montaggio,
  COALESCE(
    (SELECT MIN(k.data_carico) FROM carichi k WHERE k.commessa_id = c.id AND k.archiviato = false AND k.data_carico >= (now() AT TIME ZONE 'Europe/Rome')::date),
    (SELECT MAX(k.data_carico) FROM carichi k WHERE k.commessa_id = c.id AND k.archiviato = false),
    c.data_carico
  ) AS data_carico_eff,
  EXISTS (SELECT 1 FROM carichi k WHERE k.commessa_id = c.id AND k.archiviato = false AND k.data_carico IS NOT NULL) AS ha_carichi
  FROM commesse c`;

export async function getCommesse(): Promise<Commessa[]> {
  const { rows } = await pool.query(`${SELECT} ORDER BY numero_commessa DESC`);
  return rows.map(mapRow);
}

async function haCarichi(commessaId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM carichi WHERE commessa_id = $1 AND archiviato = false AND data_carico IS NOT NULL LIMIT 1`,
    [commessaId],
  );
  return rows.length > 0;
}

export async function getCommessaById(id: string): Promise<Commessa> {
  const { rows } = await pool.query(`${SELECT} WHERE id = $1`, [id]);
  if (rows.length === 0) throw new Error(`Commessa non trovata: ${id}`);
  return mapRow(rows[0]);
}

export async function findCommessaByNumber(numero: string): Promise<Commessa | null> {
  const { rows } = await pool.query(`${SELECT} WHERE numero_commessa = $1`, [numero]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createCommessa(data: {
  numeroCommessa: string;
  cliente?: string;
  localita?: string;
  info?: string;
  responsabile?: string;
  stato?: string;
  dataCarico?: string | null;
  inizioMontaggio?: string | null;
  fineMontaggio?: string | null;
  inizioProduzione?: string | null;
  fineProduzione?: string | null;
}): Promise<Commessa> {
  const { rows } = await pool.query(
    `INSERT INTO commesse (id, numero_commessa, cliente, localita, info, responsabile, stato, data_carico, inizio_montaggio, fine_montaggio, inizio_produzione, fine_produzione)
     VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,COALESCE($6,'ShopDrawing'),$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      data.numeroCommessa,
      data.cliente ?? "",
      data.localita ?? "",
      data.info ?? "",
      data.responsabile ?? "",
      data.stato || null,
      data.dataCarico ?? null,
      data.inizioMontaggio ?? null,
      data.fineMontaggio ?? null,
      data.inizioProduzione ?? null,
      data.fineProduzione ?? null,
    ],
  );
  return getCommessaById(rows[0].id);
}

// Cartella Drive della Commessa (root COMMESSE_DRIVE_FOLDER_ID) — popolata in modo lazy al primo
// upload di una Scheda collegata, mai alla creazione della Commessa (vedi schema_commesse_drive.sql).
export async function getCommessaFolderId(id: string): Promise<string | null> {
  const { rows } = await pool.query(`SELECT drive_folder_id FROM commesse WHERE id = $1`, [id]);
  return rows[0]?.drive_folder_id ?? null;
}

export async function setCommessaFolderId(id: string, driveFolderId: string): Promise<void> {
  await pool.query(`UPDATE commesse SET drive_folder_id = $1 WHERE id = $2`, [driveFolderId, id]);
}

export async function updateCommessa(id: string, data: CommessaUpdate): Promise<Commessa> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (data.numeroCommessa !== undefined) { sets.push(`numero_commessa = $${i++}`); values.push(data.numeroCommessa); }
  if (data.cliente !== undefined) { sets.push(`cliente = $${i++}`); values.push(data.cliente); }
  if (data.localita !== undefined) { sets.push(`localita = $${i++}`); values.push(data.localita); }
  if (data.info !== undefined) { sets.push(`info = $${i++}`); values.push(data.info); }
  if (data.responsabile !== undefined) { sets.push(`responsabile = $${i++}`); values.push(data.responsabile); }
  if (data.stato !== undefined) { sets.push(`stato = $${i++}`); values.push(data.stato); }
  // Con carichi collegati la data è derivata (vedi SELECT): la scrittura manuale viene ignorata
  // anche se arriva dall'API, altrimenti tornerebbe il conflitto con le date dei carichi.
  if (data.dataCarico !== undefined && !(await haCarichi(id))) { sets.push(`data_carico = $${i++}`); values.push(data.dataCarico); }
  if (data.inizioMontaggio !== undefined) { sets.push(`inizio_montaggio = $${i++}`); values.push(data.inizioMontaggio); }
  if (data.fineMontaggio !== undefined) { sets.push(`fine_montaggio = $${i++}`); values.push(data.fineMontaggio); }
  if (data.inizioProduzione !== undefined) { sets.push(`inizio_produzione = $${i++}`); values.push(data.inizioProduzione); }
  if (data.fineProduzione !== undefined) { sets.push(`fine_produzione = $${i++}`); values.push(data.fineProduzione); }
  sets.push(`aggiornato_il = now()`);

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE commesse SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`,
    values,
  );
  if (rows.length === 0) throw new Error(`Commessa non trovata: ${id}`);
  return getCommessaById(id);
}

export interface RiepilogoCommessa {
  odp: number;
  odpCompletati: number;
  carichi: number;
  casse: number;
  casseCaricate: number;
  campionature: number;
}

// Conteggi per la tab Panoramica della scheda commessa: una sola query, solo righe non archiviate.
export async function getRiepilogoCommessa(id: string): Promise<RiepilogoCommessa> {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM schede s WHERE s.commessa_id = $1 AND s.tipologia = 'Scheda' AND s.archiviata = false AND s.stato <> 'Annullato') AS odp,
       (SELECT COUNT(*) FROM schede s WHERE s.commessa_id = $1 AND s.tipologia = 'Scheda' AND s.archiviata = false AND s.stato = 'Completato') AS odp_completati,
       (SELECT COUNT(*) FROM carichi k WHERE k.commessa_id = $1 AND k.archiviato = false) AS carichi,
       (SELECT COUNT(*) FROM casse c WHERE c.commessa_id = $1) AS casse,
       (SELECT COUNT(*) FROM casse c WHERE c.commessa_id = $1 AND c.stato = 'Caricata') AS casse_caricate,
       (SELECT COUNT(*) FROM schede_verniciatura sv WHERE sv.commessa_id = $1 AND sv.attivo = true) AS campionature`,
    [id],
  );
  const r = rows[0];
  return {
    odp: Number(r.odp), odpCompletati: Number(r.odp_completati), carichi: Number(r.carichi),
    casse: Number(r.casse), casseCaricate: Number(r.casse_caricate), campionature: Number(r.campionature),
  };
}
