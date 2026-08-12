import { pool } from "./db";
import { updateSchedaKitFerramentaDescrizione } from "./notion";
import type { DistintaKitRiga } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): DistintaKitRiga {
  return {
    id: r.id,
    odpId: r.odp_id,
    articoloId: r.articolo_id,
    // Denormalizzati sulla riga (non solo via JOIN): una riga a testo libero (articolo_id null)
    // resta leggibile comunque. Se articolo_id è impostato, a.descrizione/codice_os1 sono sempre
    // aggiornati e hanno priorità sullo snapshot preso al momento dell'inserimento.
    articoloDescrizione: r.articolo_descrizione_live ?? r.descrizione,
    articoloCodiceOs1: r.articolo_codice_os1_live ?? r.codice_os1 ?? "",
    quantita: Number(r.quantita),
    notionUrl: "", // nessuna pagina Notion per la riga: la distinta vive su Postgres
  };
}

const SELECT_JOIN = `
  SELECT r.id, r.odp_id, r.articolo_id, r.descrizione, r.codice_os1, r.quantita,
         a.descrizione AS articolo_descrizione_live, a.codice_os1 AS articolo_codice_os1_live
  FROM kit_ferramenta_righe r
  LEFT JOIN articoli_ferramenta a ON a.id = r.articolo_id
`;

export async function getDistintaKitByOdp(odpId: string): Promise<DistintaKitRiga[]> {
  const { rows } = await pool.query(`${SELECT_JOIN} WHERE r.odp_id = $1 ORDER BY r.descrizione`, [odpId]);
  return rows.map(mapRow);
}

// Riepilogo testuale su Notion, best-effort: un fallimento qui non deve mai far fallire
// la mutazione Postgres, che resta l'unica fonte di verità per la distinta.
async function aggiornaDescrizioneKitSuNotion(odpId: string): Promise<void> {
  try {
    const righe = await getDistintaKitByOdp(odpId);
    const descrizione = righe.map((r) => `${r.quantita}x ${r.articoloDescrizione}`).join(", ");
    await updateSchedaKitFerramentaDescrizione(odpId, descrizione);
  } catch (e) {
    console.error("[kitFerramentaRepository] write-back Notion fallito:", e instanceof Error ? e.message : String(e));
  }
}

// Una riga ha SEMPRE un articoloId (da anagrafica) OPPURE una descrizione libera — mai nessuno
// dei due, la validazione è a carico del chiamante (route API).
export async function addDistintaRiga({ odpId, articoloId, descrizione, quantita }: {
  odpId: string; articoloId?: string | null; descrizione?: string | null; quantita: number;
}): Promise<DistintaKitRiga> {
  let descrizioneSalvata = descrizione ?? null;
  let codiceOs1Salvato: string | null = null;
  if (articoloId) {
    const { rows } = await pool.query(`SELECT descrizione, codice_os1 FROM articoli_ferramenta WHERE id = $1`, [articoloId]);
    if (rows.length === 0) throw new Error("Articolo non trovato");
    descrizioneSalvata = rows[0].descrizione;
    codiceOs1Salvato = rows[0].codice_os1;
  }
  if (!descrizioneSalvata) throw new Error("Descrizione obbligatoria per una riga senza articolo");

  const { rows } = await pool.query(
    `INSERT INTO kit_ferramenta_righe (odp_id, articolo_id, descrizione, codice_os1, quantita) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [odpId, articoloId ?? null, descrizioneSalvata, codiceOs1Salvato, quantita],
  );
  const id = rows[0].id as string;
  const { rows: joined } = await pool.query(`${SELECT_JOIN} WHERE r.id = $1`, [id]);
  await aggiornaDescrizioneKitSuNotion(odpId);
  return mapRow(joined[0]);
}

export async function updateDistintaRigaQuantita(id: string, quantita: number): Promise<void> {
  const { rows } = await pool.query(
    `UPDATE kit_ferramenta_righe SET quantita = $1, aggiornato_il = now() WHERE id = $2 RETURNING odp_id`,
    [quantita, id],
  );
  if (rows[0]) await aggiornaDescrizioneKitSuNotion(rows[0].odp_id);
}

export async function deleteDistintaRiga(id: string): Promise<void> {
  const { rows } = await pool.query(`DELETE FROM kit_ferramenta_righe WHERE id = $1 RETURNING odp_id`, [id]);
  if (rows[0]) await aggiornaDescrizioneKitSuNotion(rows[0].odp_id);
}

// Elimina l'intero "foglio di scarico" di un ODP: tutte le righe della distinta, non una alla
// volta. Usata quando si annulla il kit dalla pagina Kit Ferramenta ODP (stato Si → azzerato) —
// senza questo, le righe restavano orfane in Postgres pur non comparendo più da nessuna parte.
export async function deleteDistintaKitByOdp(odpId: string): Promise<void> {
  await pool.query(`DELETE FROM kit_ferramenta_righe WHERE odp_id = $1`, [odpId]);
  await updateSchedaKitFerramentaDescrizione(odpId, "");
}
