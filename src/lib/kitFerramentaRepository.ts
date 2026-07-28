import { pool } from "./db";
import { updateSchedaKitFerramentaDescrizione } from "./notion";
import type { DistintaKitRiga } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): DistintaKitRiga {
  return {
    id: r.id,
    odpId: r.odp_id,
    articoloId: r.articolo_id,
    articoloDescrizione: r.articolo_descrizione,
    articoloCodiceOs1: r.articolo_codice_os1,
    quantita: Number(r.quantita),
    notionUrl: "", // nessuna pagina Notion per la riga: la distinta vive su Postgres
  };
}

const SELECT_JOIN = `
  SELECT r.id, r.odp_id, r.articolo_id, a.descrizione AS articolo_descrizione, a.codice_os1 AS articolo_codice_os1, r.quantita
  FROM kit_ferramenta_righe r
  JOIN articoli_ferramenta a ON a.id = r.articolo_id
`;

export async function getDistintaKitByOdp(odpId: string): Promise<DistintaKitRiga[]> {
  const { rows } = await pool.query(`${SELECT_JOIN} WHERE r.odp_id = $1 ORDER BY a.descrizione`, [odpId]);
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

export async function addDistintaRiga({ odpId, articoloId, quantita }: { odpId: string; articoloId: string; quantita: number }): Promise<DistintaKitRiga> {
  const { rows } = await pool.query(
    `INSERT INTO kit_ferramenta_righe (odp_id, articolo_id, quantita) VALUES ($1, $2, $3) RETURNING id`,
    [odpId, articoloId, quantita],
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
