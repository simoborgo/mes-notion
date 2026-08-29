import type { Pool, PoolClient } from "pg";
import { pool } from "./db";
import { prefissoBarcodeCliente } from "./verniciNormalizers";

// Genera un nuovo codice_pubblico via upsert atomico sul contatore cliente/anno.
// Va chiamata DENTRO la transazione dell'insert scheda, con lo stesso client
// (l'UPSERT con ON CONFLICT è atomico in Postgres: nessun rischio di race condition
// anche con insert concorrenti sullo stesso cliente). Il contatore resta indicizzato per nome
// cliente testo (contatori_barcode_cliente non dipende dalla FK cliente_id).
export async function generaCodicePubblico(client: PoolClient, cliente: string): Promise<string> {
  const anno = new Date().getFullYear();
  const prefisso = prefissoBarcodeCliente(cliente);

  const { rows } = await client.query(
    `INSERT INTO contatori_barcode_cliente (cliente, anno, contatore)
     VALUES ($1, $2, 1)
     ON CONFLICT (cliente, anno)
     DO UPDATE SET contatore = contatori_barcode_cliente.contatore + 1
     RETURNING contatore`,
    [cliente, anno]
  );
  const contatore = rows[0].contatore as number;
  return `${prefisso}-${anno}-${String(contatore).padStart(4, "0")}`;
}

// Vernici principali (ruolo_in_fase='vernice') usate in una scheda, su tutte le sue fasi —
// usato per confrontare "stesse vernici principali" tra due schede in fase di riuso barcode.
async function getVerniciPrincipaliDellaScheda(schedaId: string, executor: Pool | PoolClient): Promise<Set<string>> {
  const { rows } = await executor.query(
    `SELECT DISTINCT svfp.vernice_id
     FROM schede_verniciatura_fasi_prodotti svfp
     JOIN schede_verniciatura_fasi svf ON svf.id = svfp.fase_id
     WHERE svf.scheda_id = $1 AND svfp.ruolo_in_fase = 'vernice'`,
    [schedaId]
  );
  return new Set(rows.map((r) => r.vernice_id as string));
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// Cerca una scheda approvata esistente per lo stesso cliente e le stesse vernici principali
// della scheda indicata — se trovata, il suo codice_pubblico va riusato invece di generarne uno
// nuovo (continuità del barcode verso il cliente).
export async function trovaCodicePubblicoRiusabile(
  clienteId: number,
  schedaId: string,
  executor: Pool | PoolClient = pool
): Promise<string | null> {
  const targetSet = await getVerniciPrincipaliDellaScheda(schedaId, executor);
  if (targetSet.size === 0) return null;

  const { rows } = await executor.query(
    `SELECT id, codice_pubblico
     FROM schede_verniciatura
     WHERE cliente_id = $1 AND stato = 'approvato' AND attivo = true AND id != $2
     ORDER BY created_at DESC`,
    [clienteId, schedaId]
  );

  for (const row of rows) {
    const candidateSet = await getVerniciPrincipaliDellaScheda(row.id as string, executor);
    if (setsEqual(targetSet, candidateSet)) return row.codice_pubblico as string;
  }
  return null;
}
