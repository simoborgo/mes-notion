// Migrazione una tantum: Schede/Sottoschede/Rilavorazioni da Notion a Postgres.
// Ripetibile in sicurezza (upsert su id). Uso: node scripts/migrate-schede-to-postgres.mjs
//
// Prerequisito: verifiche-backend/schema_schede.sql già applicato. Commesse/Aree/Fornitori già
// migrati (Fasi 1-3) — le relation vengono azzerate a NULL se puntano a un id non presente in
// Postgres, invece di far fallire l'insert per violazione FK.
//
// File: NON fa alcun backfill dei file storici (PDF/Foto/Copertina/Ordine Fornitore restano su
// Notion, come deciso con l'utente) — cattura solo il CONTEGGIO di quanti ce n'erano al momento
// della migrazione (legacy_*_count), usato dal repository come fallback verso il proxy
// /api/files/[pageId] finché non arriva un nuovo upload su Drive per quella Scheda.
import fs from "node:fs";
import pg from "pg";

const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const token = env.NOTION_TOKEN;
const dbSchede = env.NOTION_DB_SCHEDE;

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
  console.log("=== 1. Schede da Notion (può richiedere 15-20s) ===");
  const pages = await queryAllNotion(dbSchede);
  console.log(`Trovate: ${pages.length}`);

  console.log("\n=== 2. Id validi già su Postgres (Commesse/Aree/Fornitori) ===");
  const [commesseIds, areeIds, fornitoriIds] = await Promise.all([
    pool.query("SELECT id FROM commesse").then(r => new Set(r.rows.map(x => x.id))),
    pool.query("SELECT id FROM aree").then(r => new Set(r.rows.map(x => x.id))),
    pool.query("SELECT id FROM fornitori").then(r => new Set(r.rows.map(x => x.id))),
  ]);
  console.log(`commesse: ${commesseIds.size}, aree: ${areeIds.size}, fornitori: ${fornitoriIds.size}`);

  const STATI_VALIDI = new Set(["Da Iniziare", "In lavorazione", "In lavorazione Esterna", "Materiale Pronto",
    "Verificato", "Completato", "In Attesa Rilavorazione", "In attesa materiale", "Produzione Bloccata",
    "Annullata", "Revisione UTT"]);
  const FASI_VALIDE = new Set(["", "Sviluppo Distinte", "Sezionatura", "Lavorazione CNC", "Preassemblaggio",
    "Verniciatura", "Montaggio finale", "Controllo Qualità"]);
  const STATI_ESTERNA_VALIDI = new Set(["", "Da Ordinare", "Da Inviare", "In Lavorazione", "Rientrato",
    "In attesa Preventivo", "Fornitore in attesa materiale"]);

  const schedeIdSet = new Set(pages.map(p => p.id));
  let scartiRelazioni = { commessa: 0, area: 0, fornitore: 0, parent: 0, stato: 0, fase: 0, statoEsterna: 0 };

  const schede = pages.map((page) => {
    const props = page.properties;
    const commessaId = getRelationId(props["Commessa Nr"]);
    const areaId = getRelationId(props["Area-Cartella Commessa"]);
    const fornitoreId = getRelationId(props["Fornitore"]);
    const parentId = getRelationId(props["Parent item"]);

    let stato = getText(props["Stato"]) || "Da Iniziare";
    if (!STATI_VALIDI.has(stato)) { scartiRelazioni.stato++; stato = "Da Iniziare"; }
    let fase = getText(props["Fase Corrente"]);
    if (!FASI_VALIDE.has(fase)) { scartiRelazioni.fase++; fase = ""; }
    let statoEsterna = getText(props["Stato Produzione Esterna"]);
    if (!STATI_ESTERNA_VALIDI.has(statoEsterna)) { scartiRelazioni.statoEsterna++; statoEsterna = ""; }

    const commessaIdValida = commessaId && commesseIds.has(commessaId) ? commessaId : (commessaId ? (scartiRelazioni.commessa++, null) : null);
    const areaIdValida = areaId && areeIds.has(areaId) ? areaId : (areaId ? (scartiRelazioni.area++, null) : null);
    const fornitoreIdValida = fornitoreId && fornitoriIds.has(fornitoreId) ? fornitoreId : (fornitoreId ? (scartiRelazioni.fornitore++, null) : null);
    const parentIdValida = parentId && schedeIdSet.has(parentId) ? parentId : (parentId ? (scartiRelazioni.parent++, null) : null);

    const kitFerramenta = getText(props["Kit Ferramenta"]);

    return {
      id: page.id,
      odp: getText(props["ODP"]),
      numeroScheda: getText(props["Numero Scheda"]),
      tipologia: getText(props["Tipologia"]) || "Scheda",
      stato,
      faseCorrente: fase,
      descrizioneFasi: getText(props["Descrizione/Fasi/Piano/Stanza"]),
      codiceArticolo: getText(props["Codice Art."]),
      posizione: getText(props["Posizione"]),
      quantita: getNumber(props["Quantità"]),
      dataSchedaRicevuta: getDate(props["Data Scheda Ricevuta"]),
      dataProduzionePrevista: getDate(props["Data Produzione Prevista"]),
      produzioneEsterna: getCheckbox(props["Produzione Esterna"]),
      statoProdEsterna: statoEsterna,
      fornitoreId: fornitoreIdValida,
      dataRientroPrevista: getDate(props["Data Rientro Prevista"]),
      dataUscitaMateriale: getDate(props["Data Uscita Materiale"]),
      dataRientroEffettiva: getDate(props["Data Rientro Effettiva"]),
      commessaId: commessaIdValida,
      areaId: areaIdValida,
      parentId: parentIdValida,
      kitFerramenta: kitFerramenta === "Si" || kitFerramenta === "No" ? kitFerramenta : "",
      descrizioneKitFerramenta: getText(props["Descrizione Kit Ferramenta"]),
      noteStato: getText(props["Note Stato"]),
      archiviata: page.archived === true,
      legacyPdfAllegatoCount: getFilesCount(props["PDF Allegato"]),
      legacyOrdineFornitoreCount: getFilesCount(props["Ordine Fornitore"]),
      legacyFotoCount: getFilesCount(props["Foto"]),
      legacyCopertina: getFilesCount(props["Copertina"]) > 0,
    };
  });

  console.log("\nScarti per relazione non risolvibile (impostata a NULL, riga comunque migrata):");
  console.log(" ", scartiRelazioni);

  console.log("\n=== 3. Upsert schede su Postgres, prima passata senza parent_id (a blocchi da 300) ===");
  const client = await pool.connect();
  try {
    const CHUNK = 300;
    let inseriti = 0;
    for (let i = 0; i < schede.length; i += CHUNK) {
      const chunk = schede.slice(i, i + CHUNK);
      await client.query("BEGIN");
      for (const s of chunk) {
        await client.query(
          `INSERT INTO schede (id, odp, numero_scheda, tipologia, stato, fase_corrente, descrizione_fasi,
             codice_articolo, posizione, quantita, data_scheda_ricevuta, data_produzione_prevista,
             produzione_esterna, stato_prod_esterna, fornitore_id, data_rientro_prevista, data_uscita_materiale,
             data_rientro_effettiva, commessa_id, area_id, kit_ferramenta, descrizione_kit_ferramenta,
             note_stato, archiviata, legacy_pdf_allegato_count, legacy_ordine_fornitore_count,
             legacy_foto_count, legacy_copertina)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
           ON CONFLICT (id) DO UPDATE SET
             odp = EXCLUDED.odp, numero_scheda = EXCLUDED.numero_scheda, tipologia = EXCLUDED.tipologia,
             stato = EXCLUDED.stato, fase_corrente = EXCLUDED.fase_corrente, descrizione_fasi = EXCLUDED.descrizione_fasi,
             codice_articolo = EXCLUDED.codice_articolo, posizione = EXCLUDED.posizione, quantita = EXCLUDED.quantita,
             data_scheda_ricevuta = EXCLUDED.data_scheda_ricevuta, data_produzione_prevista = EXCLUDED.data_produzione_prevista,
             produzione_esterna = EXCLUDED.produzione_esterna, stato_prod_esterna = EXCLUDED.stato_prod_esterna,
             fornitore_id = EXCLUDED.fornitore_id, data_rientro_prevista = EXCLUDED.data_rientro_prevista,
             data_uscita_materiale = EXCLUDED.data_uscita_materiale, data_rientro_effettiva = EXCLUDED.data_rientro_effettiva,
             commessa_id = EXCLUDED.commessa_id, area_id = EXCLUDED.area_id, kit_ferramenta = EXCLUDED.kit_ferramenta,
             descrizione_kit_ferramenta = EXCLUDED.descrizione_kit_ferramenta, note_stato = EXCLUDED.note_stato,
             archiviata = EXCLUDED.archiviata, legacy_pdf_allegato_count = EXCLUDED.legacy_pdf_allegato_count,
             legacy_ordine_fornitore_count = EXCLUDED.legacy_ordine_fornitore_count,
             legacy_foto_count = EXCLUDED.legacy_foto_count, legacy_copertina = EXCLUDED.legacy_copertina,
             aggiornato_il = now()`,
          [s.id, s.odp, s.numeroScheda, s.tipologia, s.stato, s.faseCorrente, s.descrizioneFasi,
           s.codiceArticolo, s.posizione, s.quantita, s.dataSchedaRicevuta, s.dataProduzionePrevista,
           s.produzioneEsterna, s.statoProdEsterna, s.fornitoreId, s.dataRientroPrevista, s.dataUscitaMateriale,
           s.dataRientroEffettiva, s.commessaId, s.areaId, s.kitFerramenta, s.descrizioneKitFerramenta,
           s.noteStato, s.archiviata, s.legacyPdfAllegatoCount, s.legacyOrdineFornitoreCount,
           s.legacyFotoCount, s.legacyCopertina],
        );
      }
      await client.query("COMMIT");
      inseriti += chunk.length;
      console.log(`  ${inseriti}/${schede.length}`);
    }

    console.log("\n=== 4. Seconda passata: parent_id (Sottoschede/Rilavorazioni) ===");
    const conParent = schede.filter(s => s.parentId);
    let parentImpostati = 0;
    await client.query("BEGIN");
    for (const s of conParent) {
      await client.query(`UPDATE schede SET parent_id = $1 WHERE id = $2`, [s.parentId, s.id]);
      parentImpostati++;
    }
    await client.query("COMMIT");
    console.log(`parent_id impostato su ${parentImpostati} righe`);

    console.log("\n=== 5. Verifica finale ===");
    const { rows: count } = await client.query("SELECT count(*) FROM schede");
    const { rows: perTipo } = await client.query("SELECT tipologia, count(*) FROM schede GROUP BY tipologia ORDER BY tipologia");
    console.log(`schede: ${count[0].count} righe (attese ${schede.length})`);
    console.log("per tipologia:", perTipo.map(r => `${r.tipologia}=${r.count}`).join(", "));
  } finally {
    client.release();
  }
}

main()
  .then(() => { console.log("\nMigrazione completata."); pool.end(); })
  .catch((e) => { console.error("ERRORE:", e.message); pool.end(); process.exit(1); });
