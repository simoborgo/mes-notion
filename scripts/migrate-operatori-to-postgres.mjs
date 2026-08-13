// Migrazione una tantum: anagrafica Operatori (Personale) da Notion a Postgres.
// Ripetibile in sicurezza (upsert su id). Uso: node scripts/migrate-operatori-to-postgres.mjs
//
// Prerequisito: verifiche-backend/schema_operatori.sql già applicato (tabella + sequenza create).
import fs from "node:fs";
import pg from "pg";

const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const token = env.NOTION_TOKEN;
const dbOperatori = env.NOTION_DB_OPERATORI;

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
function getCheckbox(p) { return p?.type === "checkbox" ? !!p.checkbox : false; }

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: false });

async function main() {
  console.log("=== 1. Operatori da Notion ===");
  const pages = await queryAllNotion(dbOperatori);
  console.log(`Trovati: ${pages.length}`);

  let maxNumero = 0;
  const operatori = pages.map((page) => {
    const props = page.properties;
    const uniqueId = props["ID"]?.unique_id;
    const matricola = uniqueId ? `${uniqueId.prefix}-${String(uniqueId.number).padStart(4, "0")}` : "";
    if (uniqueId?.number > maxNumero) maxNumero = uniqueId.number;
    return {
      id: page.id,
      matricola,
      cognome: getText(props["Cognome"]),
      nome: getText(props["Nome"]),
      reparto: getText(props["Reparto"]),
      tipo: getText(props["Tipo"]),
      azienda: getText(props["Azienda"]),
      inForza: getCheckbox(props["In Forza"]),
    };
  }).filter((o) => o.matricola);

  console.log("\n=== 2. Controllo duplicati matricola ===");
  const byMatricola = new Map();
  for (const o of operatori) {
    if (!byMatricola.has(o.matricola)) byMatricola.set(o.matricola, []);
    byMatricola.get(o.matricola).push(o.id);
  }
  const duplicati = Array.from(byMatricola.entries()).filter(([, ids]) => ids.length > 1);
  if (duplicati.length > 0) {
    console.error(`TROVATE ${duplicati.length} matricole duplicate — migrazione interrotta, nessuna scrittura effettuata:`);
    duplicati.forEach(([matricola, ids]) => console.error(`  - "${matricola}": pagine ${ids.join(", ")}`));
    process.exit(1);
  }
  console.log("Nessun duplicato — si procede.");

  console.log("\n=== 3. Upsert operatori su Postgres (a blocchi da 500) ===");
  const client = await pool.connect();
  try {
    const CHUNK = 500;
    let inseriti = 0;
    for (let i = 0; i < operatori.length; i += CHUNK) {
      const chunk = operatori.slice(i, i + CHUNK);
      await client.query("BEGIN");
      for (const o of chunk) {
        await client.query(
          `INSERT INTO operatori (id, matricola, cognome, nome, reparto, tipo, azienda, in_forza)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO UPDATE SET
             matricola = EXCLUDED.matricola, cognome = EXCLUDED.cognome, nome = EXCLUDED.nome,
             reparto = EXCLUDED.reparto, tipo = EXCLUDED.tipo, azienda = EXCLUDED.azienda,
             in_forza = EXCLUDED.in_forza, aggiornato_il = now()`,
          [o.id, o.matricola, o.cognome, o.nome, o.reparto, o.tipo, o.azienda, o.inForza],
        );
      }
      await client.query("COMMIT");
      inseriti += chunk.length;
      console.log(`  ${inseriti}/${operatori.length}`);
    }

    console.log("\n=== 4. Allineamento sequenza matricole ===");
    // Prossima matricola generata dopo la migrazione riparte da maxNumero + 1, per non ripetere
    // una matricola già assegnata da Notion.
    await client.query(`SELECT setval('operatori_matricola_seq', $1, false)`, [maxNumero + 1]);
    console.log(`operatori_matricola_seq allineata a ${maxNumero + 1} (prossima: DIP-${String(maxNumero + 1).padStart(4, "0")})`);

    console.log("\n=== 5. Verifica finale ===");
    const { rows: count } = await client.query("SELECT count(*) FROM operatori");
    console.log(`operatori: ${count[0].count} righe (attesi ${operatori.length})`);
  } finally {
    client.release();
  }
}

main()
  .then(() => { console.log("\nMigrazione completata."); pool.end(); })
  .catch((e) => { console.error("ERRORE:", e.message); pool.end(); process.exit(1); });
