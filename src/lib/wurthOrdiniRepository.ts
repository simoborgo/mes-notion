import { pool } from "./db";

export interface WurthOrdineRiga {
  id: string;
  ordineId: string;
  codiceArticolo: string;
  descrizione: string;
  quantita: number;
  prezzoNettoPezzo: number;
  articoloId: string | null;
  discrepanzaPrezzo: boolean;
}

export interface WurthOrdine {
  id: string;
  numeroOrdine: string;
  dataOrdine: string | null;
  dataConsegnaPrevista: string | null;
  statoElaborazione: "ricevuto" | "elaborato" | "errore";
  errore: string | null;
  ricevutoIl: string;
  elaboratoIl: string | null;
  righe: WurthOrdineRiga[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRiga(r: any): WurthOrdineRiga {
  return {
    id: r.id,
    ordineId: r.ordine_id,
    codiceArticolo: r.codice_articolo,
    descrizione: r.descrizione,
    quantita: Number(r.quantita),
    prezzoNettoPezzo: Number(r.prezzo_netto_pezzo),
    articoloId: r.articolo_id,
    discrepanzaPrezzo: r.discrepanza_prezzo,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOrdine(r: any, righe: WurthOrdineRiga[]): WurthOrdine {
  return {
    id: r.id,
    numeroOrdine: r.numero_ordine,
    dataOrdine: r.data_ordine ? new Date(r.data_ordine).toISOString().slice(0, 10) : null,
    dataConsegnaPrevista: r.data_consegna_prevista ? new Date(r.data_consegna_prevista).toISOString().slice(0, 10) : null,
    statoElaborazione: r.stato_elaborazione,
    errore: r.errore,
    ricevutoIl: new Date(r.ricevuto_il).toISOString(),
    elaboratoIl: r.elaborato_il ? new Date(r.elaborato_il).toISOString() : null,
    righe,
  };
}

// Insert testata+righe in una transazione. Idempotente sul numero ordine: un doppio invio
// dello stesso ordine (retry n8n) non duplica righe — ritorna l'ordine già esistente.
export async function creaOrdineConRighe({
  numeroOrdine,
  dataOrdine,
  dataConsegnaPrevista,
  righe,
}: {
  numeroOrdine: string;
  dataOrdine: string | null;
  dataConsegnaPrevista: string | null;
  righe: { codiceArticolo: string; descrizione: string; quantita: number; prezzoNettoPezzo: number }[];
}): Promise<WurthOrdine> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const esistente = await client.query(`SELECT * FROM wurth_ordini WHERE numero_ordine = $1`, [numeroOrdine]);
    if (esistente.rows.length > 0) {
      await client.query("ROLLBACK");
      return getOrdineConRighe(esistente.rows[0].id);
    }

    const ins = await client.query(
      `INSERT INTO wurth_ordini (numero_ordine, data_ordine, data_consegna_prevista)
       VALUES ($1, $2, $3) RETURNING *`,
      [numeroOrdine, dataOrdine, dataConsegnaPrevista]
    );
    const ordineRow = ins.rows[0];

    const righeRows = [];
    for (const r of righe) {
      const res = await client.query(
        `INSERT INTO wurth_ordini_righe (ordine_id, codice_articolo, descrizione, quantita, prezzo_netto_pezzo)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [ordineRow.id, r.codiceArticolo, r.descrizione, r.quantita, r.prezzoNettoPezzo]
      );
      righeRows.push(res.rows[0]);
    }

    await client.query("COMMIT");
    return mapOrdine(ordineRow, righeRows.map(mapRiga));
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function getOrdineConRighe(id: string): Promise<WurthOrdine> {
  const { rows: ordineRows } = await pool.query(`SELECT * FROM wurth_ordini WHERE id = $1`, [id]);
  if (ordineRows.length === 0) throw new Error(`Ordine Wurth non trovato: ${id}`);
  const { rows: righeRows } = await pool.query(
    `SELECT * FROM wurth_ordini_righe WHERE ordine_id = $1 ORDER BY creato_il`,
    [id]
  );
  return mapOrdine(ordineRows[0], righeRows.map(mapRiga));
}

export async function getOrdiniWurth(): Promise<WurthOrdine[]> {
  const { rows: ordiniRows } = await pool.query(`SELECT * FROM wurth_ordini ORDER BY ricevuto_il DESC LIMIT 100`);
  const { rows: righeRows } = await pool.query(
    `SELECT * FROM wurth_ordini_righe WHERE ordine_id = ANY($1::uuid[]) ORDER BY creato_il`,
    [ordiniRows.map((r) => r.id)]
  );
  const righePerOrdine = new Map<string, WurthOrdineRiga[]>();
  for (const r of righeRows.map(mapRiga)) {
    const arr = righePerOrdine.get(r.ordineId) ?? [];
    arr.push(r);
    righePerOrdine.set(r.ordineId, arr);
  }
  return ordiniRows.map((r) => mapOrdine(r, righePerOrdine.get(r.id) ?? []));
}

// Scrive il risultato del matching/verifica prezzi per ogni riga e marca l'ordine come elaborato.
export async function salvaRisultatoElaborazione(
  ordineId: string,
  risultatiRighe: { rigaId: string; articoloId: string | null; discrepanzaPrezzo: boolean }[]
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const r of risultatiRighe) {
      await client.query(
        `UPDATE wurth_ordini_righe SET articolo_id = $1, discrepanza_prezzo = $2 WHERE id = $3`,
        [r.articoloId, r.discrepanzaPrezzo, r.rigaId]
      );
    }
    await client.query(
      `UPDATE wurth_ordini SET stato_elaborazione = 'elaborato', elaborato_il = now() WHERE id = $1`,
      [ordineId]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function segnaErroreElaborazione(ordineId: string, errore: string): Promise<void> {
  await pool.query(
    `UPDATE wurth_ordini SET stato_elaborazione = 'errore', errore = $1 WHERE id = $2`,
    [errore, ordineId]
  );
}
