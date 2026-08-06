// Import una tantum (Fase 4 anagrafica Ferramenta): svuota le tabelle Ferramenta e reimporta
// da zero dal CSV preparato con scripts/prepara-anagrafica-ferramenta.py. TRUNCATE + INSERT
// nella stessa transazione: se qualcosa fallisce a metà, ROLLBACK ripristina tutto (compreso
// il TRUNCATE) — non si può restare in uno stato a metà svuotato.
//
// Uso: node scripts/importa-anagrafica-ferramenta.mjs <csv-preparato>
import fs from "node:fs";
import pg from "pg";

const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Uso: node scripts/importa-anagrafica-ferramenta.mjs <csv-preparato>");
  process.exit(1);
}

// Parser CSV minimale RFC4180 (campi quotati, virgole/virgolette interne) — evita di
// dipendere da fast-csv, che è solo una dipendenza transitiva, non dichiarata dal progetto.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

async function main() {
  const testo = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(testo);
  const header = rows[0];
  const dati = rows.slice(1).filter(r => r.length === header.length && r[0]);
  console.log("Righe da importare:", dati.length);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("Svuoto articoli_ferramenta e tabelle collegate (movimenti, inventari, ordini Wurth, distinte scarico)...");
    await client.query(
      `TRUNCATE TABLE articoli_ferramenta, movimenti_ferramenta, inventari_ferramenta, wurth_ordini, distinte_scarico CASCADE`
    );

    let inseriti = 0;
    for (const r of dati) {
      const obj = Object.fromEntries(header.map((h, i) => [h, r[i]]));
      await client.query(
        `INSERT INTO articoli_ferramenta
           (id, codice_os1, descrizione, unita_misura, codice_fornitore, fornitore_nome_os1,
            descrizione_categoria, categoria_merceologica, cod_inv, inventariato,
            prezzo_ultimo_acquisto, giacenza_attuale, attivo)
         VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)`,
        [
          obj.codice_os1,
          obj.descrizione,
          obj.unita_misura,
          obj.codice_fornitore || "",
          obj.fornitore_nome_os1 || "",
          obj.descrizione_categoria || "",
          obj.categoria_merceologica || "",
          obj.cod_inv || "",
          obj.inventariato === "true",
          obj.prezzo_ultimo_acquisto ? Number(obj.prezzo_ultimo_acquisto) : null,
          obj.giacenza_attuale ? Number(obj.giacenza_attuale) : 0,
        ]
      );
      inseriti++;
      if (inseriti % 1000 === 0) console.log(`  ...${inseriti} inseriti`);
    }

    await client.query("COMMIT");
    console.log("\n--- RISULTATO ---");
    console.log("Articoli inseriti:", inseriti);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("ERRORE, ROLLBACK eseguito — nessuna modifica applicata:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

main()
  .catch(e => { console.error("ERRORE:", e.message); process.exitCode = 1; })
  .finally(() => pool.end());
