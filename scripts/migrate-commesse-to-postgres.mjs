// Migrazione una tantum: Commesse + Aree da Notion a Postgres.
// Ripetibile in sicurezza (upsert su id). Uso: node scripts/migrate-commesse-to-postgres.mjs
//
// Prerequisito: verifiche-backend/schema_commesse.sql già applicato (tabelle commesse + aree create).
// Ordine: Commesse prima (le Aree hanno una FK NOT NULL verso commesse.id).
import fs from "node:fs";
import pg from "pg";

const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const token = env.NOTION_TOKEN;
const dbCommesse = env.NOTION_DB_COMMESSE;
const dbAree = env.NOTION_DB_AREE;

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
  if (p.type === "status") return p.status?.name ?? "";
  return "";
}
function getMultiSelectJoined(p) {
  if (!p || p.type !== "multi_select") return "";
  return (p.multi_select ?? []).map((o) => o.name).join(", ");
}
function getDate(p) { return p?.type === "date" ? (p.date?.start ?? null) : null; }
function getNumber(p) { return p?.type === "number" ? p.number : null; }
function getRelationId(p) { return p?.type === "relation" && p.relation?.length ? p.relation[0].id : null; }

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: false });

async function main() {
  console.log("=== 1. Commesse da Notion ===");
  const commessePages = await queryAllNotion(dbCommesse);
  console.log(`Trovate: ${commessePages.length}`);

  const commesse = commessePages.map((page) => {
    const props = page.properties;
    return {
      id: page.id,
      numeroCommessa: getText(props["Numero Commessa"]),
      cliente: getText(props["Cliente"]),
      localita: getText(props["Località"]),
      info: getText(props["Info"]),
      responsabile: getMultiSelectJoined(props["Responsabile"]),
      stato: getText(props["Stato"]) || "ShopDrawing",
      dataCarico: getDate(props["Data Carico"]),
      inizioMontaggio: getDate(props["Inizio Montaggio"]),
      fineMontaggio: getDate(props["Fine Montaggio"]),
    };
  }).filter((c) => c.numeroCommessa);

  console.log("\n=== 2. Controllo duplicati Numero Commessa ===");
  const byNumero = new Map();
  for (const c of commesse) {
    if (!byNumero.has(c.numeroCommessa)) byNumero.set(c.numeroCommessa, []);
    byNumero.get(c.numeroCommessa).push(c.id);
  }
  const duplicati = Array.from(byNumero.entries()).filter(([, ids]) => ids.length > 1);
  if (duplicati.length > 0) {
    console.error(`TROVATI ${duplicati.length} numeri commessa duplicati — migrazione interrotta, nessuna scrittura effettuata:`);
    duplicati.forEach(([numero, ids]) => console.error(`  - "${numero}": pagine ${ids.join(", ")}`));
    process.exit(1);
  }
  console.log("Nessun duplicato — si procede.");

  const client = await pool.connect();
  try {
    console.log("\n=== 3. Upsert commesse su Postgres (a blocchi da 500) ===");
    const CHUNK = 500;
    let inseriti = 0;
    for (let i = 0; i < commesse.length; i += CHUNK) {
      const chunk = commesse.slice(i, i + CHUNK);
      await client.query("BEGIN");
      for (const c of chunk) {
        await client.query(
          `INSERT INTO commesse (id, numero_commessa, cliente, localita, info, responsabile, stato, data_carico, inizio_montaggio, fine_montaggio)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (id) DO UPDATE SET
             numero_commessa = EXCLUDED.numero_commessa, cliente = EXCLUDED.cliente, localita = EXCLUDED.localita,
             info = EXCLUDED.info, responsabile = EXCLUDED.responsabile, stato = EXCLUDED.stato,
             data_carico = EXCLUDED.data_carico, inizio_montaggio = EXCLUDED.inizio_montaggio,
             fine_montaggio = EXCLUDED.fine_montaggio, aggiornato_il = now()`,
          [c.id, c.numeroCommessa, c.cliente, c.localita, c.info, c.responsabile, c.stato, c.dataCarico, c.inizioMontaggio, c.fineMontaggio],
        );
      }
      await client.query("COMMIT");
      inseriti += chunk.length;
      console.log(`  ${inseriti}/${commesse.length}`);
    }

    console.log("\n=== 4. Aree da Notion ===");
    const areePages = await queryAllNotion(dbAree);
    console.log(`Trovate: ${areePages.length}`);

    const commessaIds = new Set(commesse.map((c) => c.id));
    let areeSaltate = 0;
    const aree = areePages.map((page) => {
      const props = page.properties;
      const commessaId = getRelationId(props["Commessa"]);
      return {
        id: page.id,
        commessaId,
        nomeArredo: getText(props["Nome Arredo"]),
        codiceArticoloA: getText(props["Codice Articolo A"]),
        dataConsegnaPrevista: getDate(props["Data Consegna Prevista"]),
        descrizione: getText(props["Descrizione"]),
        note: getText(props["Note"]),
        posizione: getText(props["Posizione"]),
        quantita: getNumber(props["Quantità"]),
        statoProduzione: getText(props["Stato Produzione"]),
      };
    }).filter((a) => {
      // Un'Area senza Commessa collegata non può rispettare la FK NOT NULL — segnalata, non migrata.
      if (!a.commessaId || !commessaIds.has(a.commessaId)) { areeSaltate++; return false; }
      return true;
    });
    if (areeSaltate > 0) console.warn(`  saltate ${areeSaltate} Aree senza Commessa collegata valida`);

    console.log("\n=== 5. Upsert aree su Postgres (a blocchi da 500) ===");
    let areeInserite = 0;
    for (let i = 0; i < aree.length; i += CHUNK) {
      const chunk = aree.slice(i, i + CHUNK);
      await client.query("BEGIN");
      for (const a of chunk) {
        await client.query(
          `INSERT INTO aree (id, commessa_id, nome_arredo, codice_articolo_a, data_consegna_prevista, descrizione, note, posizione, quantita, stato_produzione)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (id) DO UPDATE SET
             commessa_id = EXCLUDED.commessa_id, nome_arredo = EXCLUDED.nome_arredo, codice_articolo_a = EXCLUDED.codice_articolo_a,
             data_consegna_prevista = EXCLUDED.data_consegna_prevista, descrizione = EXCLUDED.descrizione, note = EXCLUDED.note,
             posizione = EXCLUDED.posizione, quantita = EXCLUDED.quantita, stato_produzione = EXCLUDED.stato_produzione,
             aggiornato_il = now()`,
          [a.id, a.commessaId, a.nomeArredo, a.codiceArticoloA, a.dataConsegnaPrevista, a.descrizione, a.note, a.posizione, a.quantita, a.statoProduzione],
        );
      }
      await client.query("COMMIT");
      areeInserite += chunk.length;
      console.log(`  ${areeInserite}/${aree.length}`);
    }

    console.log("\n=== 6. Verifica finale ===");
    const { rows: countC } = await client.query("SELECT count(*) FROM commesse");
    const { rows: countA } = await client.query("SELECT count(*) FROM aree");
    console.log(`commesse: ${countC[0].count} righe (attesi ${commesse.length})`);
    console.log(`aree: ${countA[0].count} righe (attesi ${aree.length}, saltate ${areeSaltate})`);
  } finally {
    client.release();
  }
}

main()
  .then(() => { console.log("\nMigrazione completata."); pool.end(); })
  .catch((e) => { console.error("ERRORE:", e.message); pool.end(); process.exit(1); });
