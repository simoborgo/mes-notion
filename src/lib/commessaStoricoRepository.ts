import { pool } from "./db";
import type { CategoriaStorico, EventoStorico } from "./types";
import { deleteAllegato } from "./commessaAllegatiRepository";

export interface CommessaNota { id: string; commessaId: string; testo: string; creatoDa: string; creatoIl: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapNota(r: any): CommessaNota {
  return { id: r.id, commessaId: r.commessa_id, testo: r.testo, creatoDa: r.creato_da, creatoIl: new Date(r.creato_il).toISOString() };
}

export async function getNotaById(id: string): Promise<CommessaNota | null> {
  const { rows } = await pool.query(`SELECT * FROM commessa_note WHERE id = $1`, [id]);
  return rows[0] ? mapNota(rows[0]) : null;
}

export async function createNota(data: { commessaId: string; testo: string; creatoDa: string }): Promise<CommessaNota> {
  const { rows } = await pool.query(
    `INSERT INTO commessa_note (commessa_id, testo, creato_da) VALUES ($1,$2,$3) RETURNING *`,
    [data.commessaId, data.testo, data.creatoDa],
  );
  return mapNota(rows[0]);
}

// Elimina la nota e i suoi file (anche da Drive: la cascata DB toglierebbe solo le righe).
export async function deleteNota(id: string): Promise<void> {
  const { rows } = await pool.query(`SELECT id FROM commessa_allegati WHERE nota_id = $1`, [id]);
  for (const r of rows) await deleteAllegato(r.id);
  await pool.query(`DELETE FROM commessa_note WHERE id = $1`, [id]);
}

const LIMITE = 300;

const ETICHETTE_CAMPI: Record<string, string> = {
  numeroCommessa: "Numero", cliente: "Cliente", localita: "Località", info: "Info", responsabile: "Responsabile",
  stato: "Stato", dataCarico: "Data carico", inizioMontaggio: "Inizio montaggio", fineMontaggio: "Fine montaggio",
  inizioProduzione: "Inizio produzione", fineProduzione: "Fine produzione",
};

function valore(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").reverse().join("/") : s;
}

// "Commessa modificata: Stato In produzione → In spedizione; Inizio montaggio — → 05/10/2026".
// Le voci registrate prima del diff (body intero del form, senza "campi") restano generiche.
function testoModificaCommessa(dettaglio: string | null): string {
  try {
    const campi = dettaglio ? (JSON.parse(dettaglio).campi as Record<string, { da: unknown; a: unknown }> | undefined) : undefined;
    if (!campi || Object.keys(campi).length === 0) return "Commessa modificata";
    const parti = Object.entries(campi).map(([k, { da, a }]) => `${ETICHETTE_CAMPI[k] ?? k} ${valore(da)} → ${valore(a)}`);
    return `Commessa modificata: ${parti.join("; ")}`;
  } catch {
    return "Commessa modificata";
  }
}

// Feed unico della commessa: note scritte a mano + eventi ricostruiti da tabelle di dominio e
// audit_log. Gli eventi sono letti, non copiati: nessuna possibilità di andare fuori sync.
export async function getStoricoCommessa(commessaId: string): Promise<EventoStorico[]> {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT 'nota-' || n.id AS id, n.creato_il AS quando, 'Note' AS categoria, n.testo, n.creato_da AS autore, n.id AS nota_id, NULL AS dettaglio
         FROM commessa_note n WHERE n.commessa_id = $1
       UNION ALL
       SELECT 'audit-' || a.id, a.creato_il,
              CASE WHEN a.azione LIKE '% commessa_specifica' THEN 'Specifiche'
                   WHEN a.azione LIKE '% commessa_allegato' THEN 'Documenti' ELSE 'Commessa' END,
              CASE a.azione
                WHEN 'CREATE commessa_specifica' THEN 'Aggiunta specifica: ' || COALESCE(a.modifiche::jsonb->>'titolo', '')
                WHEN 'UPDATE commessa_specifica' THEN 'Modificata specifica' || COALESCE(': ' || (a.modifiche::jsonb->>'titolo'), '')
                WHEN 'DELETE commessa_specifica' THEN 'Eliminata specifica: ' || COALESCE(a.modifiche::jsonb->>'titolo', '')
                WHEN 'CREATE commessa_allegato' THEN 'Caricato documento: ' || COALESCE(a.modifiche::jsonb->>'filename', '')
                WHEN 'DELETE commessa_allegato' THEN 'Eliminato documento: ' || COALESCE(a.modifiche::jsonb->>'filename', '')
                WHEN 'CREATE commessa' THEN 'Commessa creata'
                ELSE 'Commessa modificata' END,
              a.operatore, NULL, CASE WHEN a.azione = 'UPDATE commessa' THEN a.modifiche END
         FROM audit_log a
        WHERE (a.azione IN ('CREATE commessa', 'UPDATE commessa') AND a.id_risorsa = $1::text)
           OR (a.azione IN ('CREATE commessa_specifica', 'UPDATE commessa_specifica', 'DELETE commessa_specifica', 'CREATE commessa_allegato', 'DELETE commessa_allegato')
               AND CASE WHEN a.azione LIKE '% commessa_%' THEN a.modifiche::jsonb->>'commessaId' END = $1::text)
       UNION ALL
       SELECT 'sv-' || sv.id, sv.created_at, 'Campionature',
              'Scheda di verniciatura v' || sv.versione || COALESCE(' «' || sv.nome || '»', '') || ' creata', NULL, NULL, NULL
         FROM schede_verniciatura sv WHERE sv.commessa_id = $1 AND sv.attivo = true
       UNION ALL
       SELECT 'svv-' || sv.id, sv.validato_at, 'Campionature',
              'Scheda di verniciatura v' || sv.versione || COALESCE(' «' || sv.nome || '»', '') || ' approvata', NULL, NULL, NULL
         FROM schede_verniciatura sv WHERE sv.commessa_id = $1 AND sv.attivo = true AND sv.stato = 'approvato' AND sv.validato_at IS NOT NULL
       UNION ALL
       SELECT 'odp-' || s.id, s.data_produzione_effettiva::timestamptz, 'Produzione',
              'ODP ' || s.odp || ' completato', NULL, NULL, NULL
         FROM schede s WHERE s.commessa_id = $1 AND s.tipologia = 'Scheda' AND s.archiviata = false AND s.data_produzione_effettiva IS NOT NULL
       UNION ALL
       SELECT 'cassa-' || c.id, c.creato_il, 'Logistica',
              'Cassa ' || c.numero || COALESCE(' (' || NULLIF(c.descrizione, '') || ')', '') || ' creata', NULL, NULL, NULL
         FROM casse c WHERE c.commessa_id = $1
       UNION ALL
       SELECT 'cassac-' || c.id, c.aggiornato_il, 'Logistica',
              'Cassa ' || c.numero || ' caricata', NULL, NULL, NULL
         FROM casse c WHERE c.commessa_id = $1 AND c.stato = 'Caricata'
       UNION ALL
       SELECT 'carico-' || k.id, k.creato_il, 'Logistica',
              'Carico' || COALESCE(' «' || NULLIF(k.titolo, '') || '»', '') || COALESCE(' del ' || to_char(k.data_carico, 'DD/MM/YYYY'), '') || ' creato', NULL, NULL, NULL
         FROM carichi k WHERE k.commessa_id = $1 AND k.archiviato = false
     ) e WHERE e.quando IS NOT NULL ORDER BY e.quando DESC LIMIT ${LIMITE}`,
    [commessaId],
  );

  const noteIds = rows.filter((r) => r.nota_id).map((r) => r.nota_id as string);
  const files = noteIds.length
    ? (await pool.query(`SELECT id, nota_id, nome_file, drive_file_id FROM commessa_allegati WHERE nota_id = ANY($1) ORDER BY creato_il`, [noteIds])).rows
    : [];

  return rows.map((r) => ({
    id: r.id,
    quando: new Date(r.quando).toISOString(),
    categoria: r.categoria as CategoriaStorico,
    testo: r.dettaglio ? testoModificaCommessa(r.dettaglio) : r.testo,
    autore: r.autore || null,
    ...(r.nota_id ? {
      notaId: r.nota_id as string,
      allegati: files.filter((f) => f.nota_id === r.nota_id).map((f) => ({ id: f.id, nomeFile: f.nome_file, driveFileId: f.drive_file_id })),
    } : {}),
  }));
}
