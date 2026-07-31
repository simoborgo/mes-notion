// Import una tantum: imposta prezzo_riferimento sugli articoli Ferramenta già in anagrafica,
// usando il prezzo più recente (per data documento) dallo storico acquisti Wurth 2023-2026.
// Match per codice_os1. Non tocca gli articoli non trovati in anagrafica (restano segnalati
// a console, nessuna creazione automatica di nuovi articoli).
// Uso: node scripts/importa-prezzi-storico-wurth.mjs /tmp/acquisti-wurth.json
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

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("Uso: node scripts/importa-prezzi-storico-wurth.mjs <path-json-estratto>");
  process.exit(1);
}

async function main() {
  const righe = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  console.log("righe lette dal file:", righe.length);

  // Per ogni codice_os1, tiene solo la riga con data più recente.
  const ultimoPerCodice = new Map();
  for (const r of righe) {
    const attuale = ultimoPerCodice.get(r.codiceOs1);
    if (!attuale || r.data > attuale.data) ultimoPerCodice.set(r.codiceOs1, r);
  }
  console.log("codici OS1 unici (prezzo più recente):", ultimoPerCodice.size);

  const { rows: articoli } = await pool.query(
    `SELECT id, codice_os1, prezzo_riferimento FROM articoli_ferramenta WHERE codice_os1 = ANY($1::text[])`,
    [[...ultimoPerCodice.keys()]]
  );
  const articoloPerCodice = new Map(articoli.map((a) => [a.codice_os1, a]));

  let aggiornati = 0;
  const nonTrovati = [];
  const dettaglioAggiornati = [];

  for (const [codiceOs1, dato] of ultimoPerCodice) {
    const articolo = articoloPerCodice.get(codiceOs1);
    if (!articolo) {
      nonTrovati.push({ codiceOs1, descrizione: dato.descrizione, prezzo: dato.prezzo, data: dato.data });
      continue;
    }
    await pool.query(
      `UPDATE articoli_ferramenta SET prezzo_riferimento = $1, prezzo_riferimento_aggiornato_il = now() WHERE id = $2`,
      [dato.prezzo, articolo.id]
    );
    dettaglioAggiornati.push({
      codiceOs1,
      prezzoPrecedente: articolo.prezzo_riferimento,
      prezzoNuovo: dato.prezzo,
      data: dato.data,
    });
    aggiornati++;
  }

  console.log("\n--- RISULTATO ---");
  console.log("articoli aggiornati:", aggiornati);
  console.log("codici non trovati in anagrafica:", nonTrovati.length);
  console.log("\ncodici non trovati (primi 30):");
  console.log(nonTrovati.slice(0, 30).map((n) => `${n.codiceOs1} — ${n.descrizione} (${n.prezzo}€, ${n.data})`).join("\n"));

  fs.writeFileSync("/tmp/import-prezzi-wurth-report.json", JSON.stringify({ dettaglioAggiornati, nonTrovati }, null, 2));
  console.log("\nReport completo salvato in /tmp/import-prezzi-wurth-report.json");
}

main()
  .catch((e) => {
    console.error("ERRORE:", e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
