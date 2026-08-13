// Migrazione una tantum: Carichi da Notion a Postgres. Ripetibile in sicurezza (upsert su id).
// Uso: node scripts/migrate-carichi-to-postgres.mjs
//
// Prerequisito: verifiche-backend/schema_carichi.sql già applicato. Schede/Commesse già migrati
// (Fasi 3-4) — le relation vengono azzerate a NULL/scartate se puntano a un id non presente in
// Postgres, invece di far fallire l'insert per violazione FK.
//
// File: "Documenti" non fa backfill (resta su Notion, mai scritto dall'app comunque) — cattura
// solo il conteggio (legacy_documenti_count) per il fallback verso /api/files/[pageId].
import fs from "node:fs";
import pg from "pg";

const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const token = env.NOTION_TOKEN;
const dbCarichi = env.NOTION_DB_CARICHI;

const notionHeaders = {
  Authorization: `Bearer ${token}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};

async function queryAllNotion(dbId) {
  let results = [];
  let cursor;
  let pagina = 0;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: notionHeaders,
      body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Notion query ${dbId}: ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
    results = results.concat(data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
    pagina++;
    console.log(`  pagina Notion ${pagina}: ${results.length} righe finora`);
  } while (cursor);
  return results;
}

function getText(p) {
  if (!p) return "";
  if (p.type === "title") return (p.title ?? []).map((t) => t.plain_text).join("");
  if (p.type === "rich_text") return (p.rich_text ?? []).map((t) => t.plain_text).join("");
  if (p.type === "select") return p.select?.name ?? "";
  if (p.type === "status") return p.status?.name ?? "";
  return "";
}
function getDate(p) { return p?.type === "date" ? (p.date?.start ?? null) : null; }
function getRelationId(p) { return p?.type === "relation" && p.relation?.length ? p.relation[0].id : null; }
function getRelationIds(p) { return p?.type === "relation" ? (p.relation ?? []).map((r) => r.id) : []; }
function getFilesCount(p) { return p?.type === "files" ? (p.files ?? []).length : 0; }

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: false });

async function main() {
  console.log("=== 1. Carichi da Notion ===");
  const pages = await queryAllNotion(dbCarichi);
  console.log(`Trovati: ${pages.length}`);

  console.log("\n=== 2. Id validi già su Postgres (Schede/Commesse) ===");
  const [schedeIds, commesseIds] = await Promise.all([
    pool.query("SELECT id FROM schede").then(r => new Set(r.rows.map(x => x.id))),
    pool.query("SELECT id FROM commesse").then(r => new Set(r.rows.map(x => x.id))),
  ]);
  console.log(`schede: ${schedeIds.size}, commesse: ${commesseIds.size}`);

  const MODALITA_VALIDE = new Set(["", "Gomma", "Aerea", "Nave"]);
  const STATI_VALIDI = new Set(["Pianificato", "Confermato", "Spedito"]);

  let scarti = { commessa: 0, odp: 0, modalita: 0, stato: 0 };

  const carichi = pages.map((page) => {
    const props = page.properties;
    const commessaId = getRelationId(props["Commessa"]);
    const odpIdsRaw = getRelationIds(props["ODP"]);

    let modalita = getText(props["Modalità"]);
    if (!MODALITA_VALIDE.has(modalita)) { scarti.modalita++; modalita = ""; }
    let stato = getText(props["Stato"]) || "Pianificato";
    if (!STATI_VALIDI.has(stato)) { scarti.stato++; stato = "Pianificato"; }

    const commessaIdValida = commessaId && commesseIds.has(commessaId) ? commessaId : (commessaId ? (scarti.commessa++, null) : null);
    const odpIds = odpIdsRaw.filter((id) => {
      const ok = schedeIds.has(id);
      if (!ok) scarti.odp++;
      return ok;
    });

    return {
      id: page.id,
      titolo: getText(props["Titolo"]),
      descrizione: getText(props["Descrizione"]),
      dataCarico: getDate(props["Data Carico"]),
      commessaId: commessaIdValida,
      odpIds,
      modalita,
      stato,
      archiviato: page.archived === true,
      legacyDocumentiCount: getFilesCount(props["Documenti"]),
    };
  });

  console.log("\nScarti per relazione/valore non risolvibile (impostato a default, riga comunque migrata):");
  console.log(" ", scarti);

  console.log("\n=== 3. Upsert carichi su Postgres (a blocchi da 300) ===");
  const client = await pool.connect();
  try {
    const CHUNK = 300;
    let inseriti = 0;
    for (let i = 0; i < carichi.length; i += CHUNK) {
      const chunk = carichi.slice(i, i + CHUNK);
      await client.query("BEGIN");
      for (const c of chunk) {
        await client.query(
          `INSERT INTO carichi (id, titolo, descrizione, data_carico, commessa_id, modalita, stato, archiviato, legacy_documenti_count)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (id) DO UPDATE SET
             titolo = EXCLUDED.titolo, descrizione = EXCLUDED.descrizione, data_carico = EXCLUDED.data_carico,
             commessa_id = EXCLUDED.commessa_id, modalita = EXCLUDED.modalita, stato = EXCLUDED.stato,
             archiviato = EXCLUDED.archiviato, legacy_documenti_count = EXCLUDED.legacy_documenti_count,
             aggiornato_il = now()`,
          [c.id, c.titolo, c.descrizione, c.dataCarico, c.commessaId, c.modalita, c.stato, c.archiviato, c.legacyDocumentiCount],
        );
        if (c.odpIds.length) {
          await client.query(`DELETE FROM carichi_schede WHERE carico_id = $1`, [c.id]);
          for (const schedaId of c.odpIds) {
            await client.query(`INSERT INTO carichi_schede (carico_id, scheda_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [c.id, schedaId]);
          }
        }
      }
      await client.query("COMMIT");
      inseriti += chunk.length;
      console.log(`  ${inseriti}/${carichi.length}`);
    }

    console.log("\n=== 4. Verifica finale ===");
    const { rows: count } = await client.query("SELECT count(*) FROM carichi");
    const { rows: countOdp } = await client.query("SELECT count(*) FROM carichi_schede");
    console.log(`carichi: ${count[0].count} righe (attese ${carichi.length})`);
    console.log(`carichi_schede: ${countOdp[0].count} righe`);
  } finally {
    client.release();
  }
}

main()
  .then(() => { console.log("\nMigrazione completata."); pool.end(); })
  .catch((e) => { console.error("ERRORE:", e.message); pool.end(); process.exit(1); });
