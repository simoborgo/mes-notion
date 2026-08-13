// Migrazione una tantum: anagrafica Fornitori da Notion a Postgres.
// Ripetibile in sicurezza (upsert su id). Uso: node scripts/migrate-fornitori-to-postgres.mjs
//
// Prerequisito: verifiche-backend/schema_fornitori.sql già applicato (tabella fornitori creata).
// Dopo questo script, applicare verifiche-backend/schema_fornitori_fk_articoli.sql per aggiungere
// la FK reale da articoli_ferramenta.fornitore_id.
import fs from "node:fs";
import pg from "pg";

const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const token = env.NOTION_TOKEN;
const dbFornitori = env.NOTION_DB_FORNITORI;

const notionHeaders = {
  Authorization: `Bearer ${token}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};

async function queryAllNotion(dbId) {
  let results = [];
  let cursor;
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
  } while (cursor);
  return results;
}

function getText(p) {
  if (!p) return "";
  if (p.type === "title") return (p.title ?? []).map((t) => t.plain_text).join("");
  if (p.type === "rich_text") return (p.rich_text ?? []).map((t) => t.plain_text).join("");
  if (p.type === "select") return p.select?.name ?? "";
  return "";
}

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: false });

async function main() {
  console.log("=== 1. Fornitori da Notion ===");
  const pages = await queryAllNotion(dbFornitori);
  console.log(`Trovati: ${pages.length}`);

  const fornitori = pages.map((page) => ({
    id: page.id,
    nome: getText(page.properties["Nome"]),
    codiceOs1: getText(page.properties["Idfornitore"]),
  })).filter((f) => f.nome);

  console.log("\n=== 2. Controllo duplicati Codice OS1 ===");
  const byCode = new Map();
  for (const f of fornitori) {
    if (!f.codiceOs1) continue;
    if (!byCode.has(f.codiceOs1)) byCode.set(f.codiceOs1, []);
    byCode.get(f.codiceOs1).push(f.id);
  }
  const duplicati = Array.from(byCode.entries()).filter(([, ids]) => ids.length > 1);
  if (duplicati.length > 0) {
    console.error(`TROVATI ${duplicati.length} codici OS1 duplicati — migrazione interrotta, nessuna scrittura effettuata:`);
    duplicati.forEach(([codice, ids]) => console.error(`  - "${codice}": pagine ${ids.join(", ")}`));
    process.exit(1);
  }
  console.log("Nessun duplicato — si procede.");

  console.log("\n=== 3. Upsert fornitori su Postgres (a blocchi da 500) ===");
  const client = await pool.connect();
  try {
    const CHUNK = 500;
    let inseriti = 0;
    for (let i = 0; i < fornitori.length; i += CHUNK) {
      const chunk = fornitori.slice(i, i + CHUNK);
      await client.query("BEGIN");
      for (const f of chunk) {
        await client.query(
          `INSERT INTO fornitori (id, nome, codice_os1)
           VALUES ($1,$2,$3)
           ON CONFLICT (id) DO UPDATE SET
             nome = EXCLUDED.nome, codice_os1 = EXCLUDED.codice_os1, aggiornato_il = now()`,
          [f.id, f.nome, f.codiceOs1],
        );
      }
      await client.query("COMMIT");
      inseriti += chunk.length;
      console.log(`  ${inseriti}/${fornitori.length}`);
    }

    console.log("\n=== 4. Verifica finale ===");
    const { rows: count } = await client.query("SELECT count(*) FROM fornitori");
    console.log(`fornitori: ${count[0].count} righe (attesi ${fornitori.length})`);
    console.log("\nProssimo passo manuale: applicare schema_fornitori_fk_articoli.sql per la FK.");
  } finally {
    client.release();
  }
}

main()
  .then(() => { console.log("\nMigrazione completata."); pool.end(); })
  .catch((e) => { console.error("ERRORE:", e.message); pool.end(); process.exit(1); });
