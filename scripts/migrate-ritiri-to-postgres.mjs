// Migrazione una tantum: Ritiri/Consegne da Notion a Postgres. Ripetibile in sicurezza (upsert su
// id). Uso: node scripts/migrate-ritiri-to-postgres.mjs
//
// Prerequisito: verifiche-backend/schema_ritiri.sql già applicato. Schede/Commesse/Fornitori già
// migrati (Fasi 1-4) — le relation vengono azzerate a NULL se puntano a un id non presente in
// Postgres, invece di far fallire l'insert per violazione FK.
//
// File: "PDF Scheda"/"Ordine Fornitore" su Ritiro sono rollup dalla Scheda (verificato via
// schema Notion reale) — non hanno colonna, si calcolano con una JOIN a runtime. Solo "Foto" è un
// allegato proprio del Ritiro: NON fa backfill (resta su Notion), cattura solo il conteggio
// (legacy_foto_count) per il fallback verso /api/files/[pageId] finché non arriva un nuovo upload.
import fs from "node:fs";
import pg from "pg";

const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const token = env.NOTION_TOKEN;
const dbRitiri = env.NOTION_DB_RITIRI;

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
function getNumber(p) { return p?.type === "number" ? p.number : null; }
function getCheckbox(p) { return p?.type === "checkbox" ? !!p.checkbox : false; }
function getRelationId(p) { return p?.type === "relation" && p.relation?.length ? p.relation[0].id : null; }
function getFilesCount(p) { return p?.type === "files" ? (p.files ?? []).length : 0; }

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: false });

async function main() {
  console.log("=== 1. Ritiri da Notion ===");
  const pages = await queryAllNotion(dbRitiri);
  console.log(`Trovati: ${pages.length}`);

  console.log("\n=== 2. Id validi già su Postgres (Schede/Commesse/Fornitori) ===");
  const [schedeIds, commesseIds, fornitoriIds] = await Promise.all([
    pool.query("SELECT id FROM schede").then(r => new Set(r.rows.map(x => x.id))),
    pool.query("SELECT id FROM commesse").then(r => new Set(r.rows.map(x => x.id))),
    pool.query("SELECT id FROM fornitori").then(r => new Set(r.rows.map(x => x.id))),
  ]);
  console.log(`schede: ${schedeIds.size}, commesse: ${commesseIds.size}, fornitori: ${fornitoriIds.size}`);

  const STATI_VALIDI = new Set(["Da Fare", "In corso", "Fatto"]);
  const TIPI_VALIDI = new Set(["", "Ritiro", "Consegna"]);

  let scarti = { scheda: 0, rilavorazione: 0, commessa: 0, fornitore: 0, stato: 0, tipo: 0 };

  const ritiri = pages.map((page) => {
    const props = page.properties;
    const schedaId = getRelationId(props["Scheda"]);
    const rilavorazioneId = getRelationId(props["Rilavorazione"]);
    const commessaId = getRelationId(props["Commessa"]);
    const fornitoreId = getRelationId(props["Fornitore"]);

    let stato = getText(props["Stato"]) || "Da Fare";
    if (!STATI_VALIDI.has(stato)) { scarti.stato++; stato = "Da Fare"; }
    let tipo = getText(props["Tipo movimento"]);
    if (!TIPI_VALIDI.has(tipo)) { scarti.tipo++; tipo = ""; }

    const urgenzaProp = props["Urgenza"];
    const urgenza = urgenzaProp?.type === "select" ? urgenzaProp.select?.name === "Si" : false;

    const schedaIdValida = schedaId && schedeIds.has(schedaId) ? schedaId : (schedaId ? (scarti.scheda++, null) : null);
    const rilavorazioneIdValida = rilavorazioneId && schedeIds.has(rilavorazioneId) ? rilavorazioneId : (rilavorazioneId ? (scarti.rilavorazione++, null) : null);
    const commessaIdValida = commessaId && commesseIds.has(commessaId) ? commessaId : (commessaId ? (scarti.commessa++, null) : null);
    const fornitoreIdValida = fornitoreId && fornitoriIds.has(fornitoreId) ? fornitoreId : (fornitoreId ? (scarti.fornitore++, null) : null);

    return {
      id: page.id,
      descrizione: getText(props["Descrizione"]),
      schedaId: schedaIdValida,
      rilavorazioneId: rilavorazioneIdValida,
      commessaId: commessaIdValida,
      dataTrasporto: getDate(props["Data Trasporto"]),
      dataFatto: getDate(props["Data Fatto"]),
      tipoMovimento: tipo,
      stato,
      urgenza,
      nc: getCheckbox(props["NC"]),
      nrCollo: getNumber(props["Nr Collo"]),
      totColli: getNumber(props["Tot Colli"]),
      fornitoreId: fornitoreIdValida,
      archiviato: page.archived === true,
      legacyFotoCount: getFilesCount(props["Foto"]),
    };
  });

  console.log("\nScarti per relazione/valore non risolvibile (impostato a default, riga comunque migrata):");
  console.log(" ", scarti);

  console.log("\n=== 3. Upsert ritiri su Postgres (a blocchi da 300) ===");
  const client = await pool.connect();
  try {
    const CHUNK = 300;
    let inseriti = 0;
    for (let i = 0; i < ritiri.length; i += CHUNK) {
      const chunk = ritiri.slice(i, i + CHUNK);
      await client.query("BEGIN");
      for (const r of chunk) {
        await client.query(
          `INSERT INTO ritiri (id, descrizione, scheda_id, rilavorazione_id, commessa_id, data_trasporto,
             data_fatto, tipo_movimento, stato, urgenza, nc, nr_collo, tot_colli, fornitore_id,
             archiviato, legacy_foto_count)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (id) DO UPDATE SET
             descrizione = EXCLUDED.descrizione, scheda_id = EXCLUDED.scheda_id,
             rilavorazione_id = EXCLUDED.rilavorazione_id, commessa_id = EXCLUDED.commessa_id,
             data_trasporto = EXCLUDED.data_trasporto, data_fatto = EXCLUDED.data_fatto,
             tipo_movimento = EXCLUDED.tipo_movimento, stato = EXCLUDED.stato, urgenza = EXCLUDED.urgenza,
             nc = EXCLUDED.nc, nr_collo = EXCLUDED.nr_collo, tot_colli = EXCLUDED.tot_colli,
             fornitore_id = EXCLUDED.fornitore_id, archiviato = EXCLUDED.archiviato,
             legacy_foto_count = EXCLUDED.legacy_foto_count, aggiornato_il = now()`,
          [r.id, r.descrizione, r.schedaId, r.rilavorazioneId, r.commessaId, r.dataTrasporto,
           r.dataFatto, r.tipoMovimento, r.stato, r.urgenza, r.nc, r.nrCollo, r.totColli,
           r.fornitoreId, r.archiviato, r.legacyFotoCount],
        );
      }
      await client.query("COMMIT");
      inseriti += chunk.length;
      console.log(`  ${inseriti}/${ritiri.length}`);
    }

    console.log("\n=== 4. Verifica finale ===");
    const { rows: count } = await client.query("SELECT count(*) FROM ritiri");
    const { rows: perStato } = await client.query("SELECT stato, count(*) FROM ritiri GROUP BY stato ORDER BY stato");
    console.log(`ritiri: ${count[0].count} righe (attese ${ritiri.length})`);
    console.log("per stato:", perStato.map(r => `${r.stato}=${r.count}`).join(", "));
  } finally {
    client.release();
  }
}

main()
  .then(() => { console.log("\nMigrazione completata."); pool.end(); })
  .catch((e) => { console.error("ERRORE:", e.message); pool.end(); process.exit(1); });
