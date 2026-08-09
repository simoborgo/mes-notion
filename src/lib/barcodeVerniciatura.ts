import type { Pool, PoolClient } from "pg";
import { pool } from "./db";
import { prefissoBarcodeCliente } from "./verniciNormalizers";

// Genera un nuovo codice_pubblico via upsert atomico sul contatore cliente/anno.
// Va chiamata DENTRO la transazione dell'insert campionatura, con lo stesso client
// (l'UPSERT con ON CONFLICT è atomico in Postgres: nessun rischio di race condition
// anche con insert concorrenti sullo stesso cliente).
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

// Vernici principali (ruolo_in_fase='vernice') usate in un ciclo, su tutte le sue fasi —
// usato per confrontare "stesse vernici principali" tra due cicli in fase di riuso barcode.
async function getVerniciPrincipaliDelCiclo(cicloId: string, executor: Pool | PoolClient): Promise<Set<string>> {
  const { rows } = await executor.query(
    `SELECT DISTINCT cfp.vernice_id
     FROM cicli_fasi_prodotti cfp
     JOIN cicli_fasi cf ON cf.id = cfp.fase_id
     WHERE cf.ciclo_id = $1 AND cfp.ruolo_in_fase = 'vernice'`,
    [cicloId]
  );
  return new Set(rows.map((r) => r.vernice_id as string));
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// Cerca una campionatura approvata esistente per lo stesso cliente e le stesse vernici
// principali del ciclo indicato — se trovata, il suo codice_pubblico va riusato invece di
// generarne uno nuovo (continuità del barcode verso il cliente).
export async function trovaCodicePubblicoRiusabile(
  cliente: string,
  cicloId: string,
  executor: Pool | PoolClient = pool
): Promise<string | null> {
  const targetSet = await getVerniciPrincipaliDelCiclo(cicloId, executor);
  if (targetSet.size === 0) return null;

  const { rows } = await executor.query(
    `SELECT id, codice_pubblico, ciclo_id
     FROM campionature
     WHERE cliente = $1 AND esito = 'approvato' AND attivo = true
     ORDER BY created_at DESC`,
    [cliente]
  );

  for (const row of rows) {
    if (row.ciclo_id === cicloId) return row.codice_pubblico as string;
    const candidateSet = await getVerniciPrincipaliDelCiclo(row.ciclo_id as string, executor);
    if (setsEqual(targetSet, candidateSet)) return row.codice_pubblico as string;
  }
  return null;
}
