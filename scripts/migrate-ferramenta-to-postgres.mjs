// Migrazione una tantum: anagrafica Ferramenta + Kit ODP righe da Notion a Postgres.
// Ripetibile in sicurezza (upsert su id). Uso: node scripts/migrate-ferramenta-to-postgres.mjs
import fs from "node:fs";
import pg from "pg";

const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const token = env.NOTION_TOKEN;
const dbFerramenta = env.NOTION_DB_FERRAMENTA;
const dbFornitori = env.NOTION_DB_FORNITORI;
const dbKitRighe = env.NOTION_DB_KIT_FERRAMENTA_RIGHE;

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
function getNumber(p) { return p?.type === "number" ? p.number : null; }
function getCheckbox(p) { return p?.type === "checkbox" ? !!p.checkbox : false; }
function getRelationId(p) { return p?.type === "relation" && p.relation?.length ? p.relation[0].id : null; }

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: false });

async function main() {
  console.log("=== 1. Fornitori (per risolvere fornitore_nome) ===");
  const fornitoriPages = await queryAllNotion(dbFornitori);
  const fornitoriMap = {};
  fornitoriPages.forEach((p) => { fornitoriMap[p.id] = getText(p.properties["Nome"]); });
  console.log(`Fornitori censiti: ${Object.keys(fornitoriMap).length}`);

  console.log("\n=== 2. Articoli Ferramenta da Notion ===");
  const articoliPages = await queryAllNotion(dbFerramenta);
  console.log(`Trovati: ${articoliPages.length}`);

  const articoli = articoliPages.map((page) => {
    const props = page.properties;
    const fornitoreId = getRelationId(props["🏭 Fornitore"]);
    const metodo = getText(props["Metodo Gestione"]);
    return {
      id: page.id,
      codiceOs1: getText(props["Codice OS1"]),
      descrizione: getText(props["Descrizione"]),
      unitaMisura: getText(props["Unita di Misura"]),
      fornitoreId,
      fornitoreNome: fornitoreId ? (fornitoriMap[fornitoreId] ?? "") : "",
      fornitoreNomeOs1: getText(props["Fornitore Nome OS1"]),
      codiceFornitore: getText(props["Codice Fornitore"]),
      metodoGestione: metodo === "Kanban" || metodo === "A Pezzo" ? metodo : null,
      giacenzaAttuale: getNumber(props["Giacenza Attuale"]) ?? 0,
      quantitaStandardVaschetta: getNumber(props["Quantità Standard Vaschetta"]),
      sogliaMinima: getNumber(props["Soglia Minima"]),
      attivo: getCheckbox(props["Attivo"]),
      note: getText(props["Note"]),
      ubicazione: getText(props["Ubicazione"]) || null,
    };
  });

  console.log("\n=== 3. Controllo duplicati Codice OS1 ===");
  const byCode = new Map();
  for (const a of articoli) {
    if (!byCode.has(a.codiceOs1)) byCode.set(a.codiceOs1, []);
    byCode.get(a.codiceOs1).push(a.id);
  }
  const duplicati = Array.from(byCode.entries()).filter(([, ids]) => ids.length > 1);
  if (duplicati.length > 0) {
    console.error(`TROVATI ${duplicati.length} codici OS1 duplicati — migrazione interrotta, nessuna scrittura effettuata:`);
    duplicati.forEach(([codice, ids]) => console.error(`  - "${codice}": pagine ${ids.join(", ")}`));
    process.exit(1);
  }
  console.log("Nessun duplicato — si procede.");

  console.log("\n=== 4. Upsert articoli su Postgres (a blocchi da 500) ===");
  const client = await pool.connect();
  try {
    const CHUNK = 500;
    let inseriti = 0;
    for (let i = 0; i < articoli.length; i += CHUNK) {
      const chunk = articoli.slice(i, i + CHUNK);
      await client.query("BEGIN");
      for (const a of chunk) {
        await client.query(
          `INSERT INTO articoli_ferramenta
             (id, codice_os1, descrizione, unita_misura, fornitore_id, fornitore_nome, fornitore_nome_os1, codice_fornitore,
              metodo_gestione, giacenza_attuale, quantita_standard_vaschetta, soglia_minima, attivo, note, ubicazione)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (id) DO UPDATE SET
             codice_os1 = EXCLUDED.codice_os1, descrizione = EXCLUDED.descrizione, unita_misura = EXCLUDED.unita_misura,
             fornitore_id = EXCLUDED.fornitore_id, fornitore_nome = EXCLUDED.fornitore_nome, fornitore_nome_os1 = EXCLUDED.fornitore_nome_os1,
             codice_fornitore = EXCLUDED.codice_fornitore, metodo_gestione = EXCLUDED.metodo_gestione, giacenza_attuale = EXCLUDED.giacenza_attuale,
             quantita_standard_vaschetta = EXCLUDED.quantita_standard_vaschetta, soglia_minima = EXCLUDED.soglia_minima,
             attivo = EXCLUDED.attivo, note = EXCLUDED.note, ubicazione = EXCLUDED.ubicazione, aggiornato_il = now()`,
          [a.id, a.codiceOs1, a.descrizione, a.unitaMisura, a.fornitoreId, a.fornitoreNome, a.fornitoreNomeOs1, a.codiceFornitore,
           a.metodoGestione, a.giacenzaAttuale, a.quantitaStandardVaschetta, a.sogliaMinima, a.attivo, a.note, a.ubicazione],
        );
      }
      await client.query("COMMIT");
      inseriti += chunk.length;
      console.log(`  ${inseriti}/${articoli.length}`);
    }

    console.log("\n=== 5. Kit ODP righe ===");
    const kitPages = dbKitRighe ? await queryAllNotion(dbKitRighe) : [];
    console.log(`Trovate ${kitPages.length} righe su Notion`);
    let kitMigrate = 0, kitSaltate = 0;
    for (const page of kitPages) {
      const odpId = getRelationId(page.properties["ODP"]);
      const articoloId = getRelationId(page.properties["Articolo Ferramenta"]);
      const quantita = getNumber(page.properties["Quantità"]);
      if (!odpId || !articoloId || !quantita || quantita <= 0) {
        console.warn(`  saltata riga ${page.id} (dati incompleti: odpId=${odpId}, articoloId=${articoloId}, quantita=${quantita})`);
        kitSaltate++;
        continue;
      }
      await client.query(
        `INSERT INTO kit_ferramenta_righe (odp_id, articolo_id, quantita) VALUES ($1,$2,$3)`,
        [odpId, articoloId, quantita],
      );
      kitMigrate++;
    }
    console.log(`Migrate: ${kitMigrate}, saltate: ${kitSaltate}`);

    console.log("\n=== 6. Verifica finale ===");
    const { rows: countArt } = await client.query("SELECT count(*) FROM articoli_ferramenta");
    const { rows: countKit } = await client.query("SELECT count(*) FROM kit_ferramenta_righe");
    console.log(`articoli_ferramenta: ${countArt[0].count} righe (attesi ${articoli.length})`);
    console.log(`kit_ferramenta_righe: ${countKit[0].count} righe`);
  } finally {
    client.release();
  }
}

main()
  .then(() => { console.log("\nMigrazione completata."); pool.end(); })
  .catch((e) => { console.error("ERRORE:", e.message); pool.end(); process.exit(1); });
