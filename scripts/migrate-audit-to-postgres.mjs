// Migrazione una tantum: Audit Log da Notion a Postgres. Uso: node scripts/migrate-audit-to-postgres.mjs
//
// A differenza delle altre migrazioni, qui NON si fa upsert per id (l'audit log è append-only,
// nessun'altra tabella referenzia queste righe) — lo script va lanciato una sola volta. Rilanciarlo
// duplicherebbe le righe già migrate.
import fs from "node:fs";
import pg from "pg";

const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const token = env.NOTION_TOKEN;
const dbAudit = env.NOTION_DB_AUDIT;

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
  return "";
}
function getDate(p) { return p?.type === "date" ? (p.date?.start ?? null) : null; }

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: false });

async function main() {
  if (!dbAudit) {
    console.log("NOTION_DB_AUDIT non configurato — niente da migrare.");
    return;
  }

  console.log("=== 1. Audit log da Notion ===");
  const pages = await queryAllNotion(dbAudit);
  console.log(`Trovate: ${pages.length}`);

  const { rows: existing } = await pool.query("SELECT count(*) FROM audit_log");
  if (Number(existing[0].count) > 0) {
    throw new Error(`audit_log ha già ${existing[0].count} righe — lo script è pensato per un solo lancio (append-only, non idempotente). Aborto senza scrivere.`);
  }

  const entries = pages.map((page) => {
    const props = page.properties;
    return {
      operatore: getText(props["Operatore"]),
      azione: getText(props["Azione"]),
      idRisorsa: getText(props["ID Risorsa"]),
      modifiche: getText(props["Modifiche"]),
      timestamp: getDate(props["Timestamp"]) ?? page.created_time,
    };
  });

  console.log("\n=== 2. Insert audit_log su Postgres (a blocchi da 300) ===");
  const client = await pool.connect();
  try {
    const CHUNK = 300;
    let inseriti = 0;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      await client.query("BEGIN");
      for (const e of chunk) {
        await client.query(
          `INSERT INTO audit_log (operatore, azione, id_risorsa, modifiche, creato_il) VALUES ($1,$2,$3,$4,$5)`,
          [e.operatore, e.azione, e.idRisorsa, e.modifiche, e.timestamp],
        );
      }
      await client.query("COMMIT");
      inseriti += chunk.length;
      console.log(`  ${inseriti}/${entries.length}`);
    }

    console.log("\n=== 3. Verifica finale ===");
    const { rows: count } = await client.query("SELECT count(*) FROM audit_log");
    console.log(`audit_log: ${count[0].count} righe (attese ${entries.length})`);
  } finally {
    client.release();
  }
}

main()
  .then(() => { console.log("\nMigrazione completata."); pool.end(); })
  .catch((e) => { console.error("ERRORE:", e.message); pool.end(); process.exit(1); });
