// Import una tantum (Fase 1, modulo Offerte/Storico/Previsionale): popola la tabella
// `articoli` (codice_articolo, descrizione) dallo storico "Codici Valorizzati" — un CSV
// con una riga per (commessa, codice articolo), quindi lo stesso codice può comparire più
// volte (riusato su commesse diverse) con descrizioni leggermente diverse. Per il catalogo
// prendiamo la PRIMA descrizione incontrata per ciascun codice — le varianti sono solo
// segnalate a console, non causano errori.
//
// `categoria` resta NULL: questo file non contiene un dato di categoria prodotto affidabile
// (il prefisso del codice, es. "BV"/"CA"/"RX", è il cliente/commessa, non un tipo di
// prodotto) — da classificare a mano in un secondo momento se servirà per la Fase 5.
//
// Le colonne H TOTALI / H INT-VERN NON vengono usate qui: sono materia per la Fase 4
// (storico consuntivo/Standard_Reparto), non ancora approvata — il file resta sul disco,
// da rileggere quando quella fase parte.
//
// Uso: node scripts/importa-articoli-storico.mjs [percorso-csv]
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

const csvPath = process.argv[2] ?? new URL("../Codici_Valorizzati.csv", import.meta.url).pathname;

async function main() {
  const testo = fs.readFileSync(csvPath, "utf8");
  const righe = testo.split("\n").map(r => r.trimEnd()).filter(r => r.length > 0);

  // riga 0 = titolo, riga 1 = header — le saltiamo esplicitamente
  const datiRighe = righe.slice(2);

  const perCodice = new Map(); // codice -> { descrizione, occorrenze: [{commessa, descrizione}] }
  let saltate = 0;

  for (const riga of datiRighe) {
    const campi = riga.split(";");
    if (campi.length < 3) { saltate++; continue; }
    const [commessa, codice, descrizione] = campi;
    if (!codice || !codice.trim() || commessa.trim().startsWith("TOTALE")) { saltate++; continue; }

    const codiceTrim = codice.trim();
    const descrizioneTrim = descrizione.trim();
    if (!perCodice.has(codiceTrim)) {
      perCodice.set(codiceTrim, { descrizione: descrizioneTrim, occorrenze: [] });
    }
    perCodice.get(codiceTrim).occorrenze.push({ commessa: commessa.trim(), descrizione: descrizioneTrim });
  }

  console.log("righe dati lette:", datiRighe.length, "— saltate (totale/vuote):", saltate);
  console.log("codici articolo unici:", perCodice.size);

  // Segnala i codici con descrizioni non uniformi tra le commesse — solo informativo,
  // usiamo comunque la prima incontrata.
  const conVarianti = [...perCodice.entries()].filter(([, v]) =>
    new Set(v.occorrenze.map(o => o.descrizione)).size > 1
  );
  if (conVarianti.length > 0) {
    console.log(`\n${conVarianti.length} codici con descrizioni diverse tra le commesse (uso la prima):`);
    for (const [codice, v] of conVarianti) {
      console.log(`  ${codice}: ${[...new Set(v.occorrenze.map(o => o.descrizione))].join(" | ")}`);
    }
  }

  let inseriti = 0;
  let aggiornati = 0;
  for (const [codice, v] of perCodice) {
    const { rows } = await pool.query(
      `INSERT INTO articoli (codice_articolo, descrizione, categoria) VALUES ($1, $2, NULL)
       ON CONFLICT (codice_articolo) DO UPDATE SET descrizione = EXCLUDED.descrizione
       RETURNING (xmax = 0) AS inserito`,
      [codice, v.descrizione]
    );
    if (rows[0].inserito) inseriti++; else aggiornati++;
  }

  console.log("\n--- RISULTATO ---");
  console.log("articoli inseriti:", inseriti);
  console.log("articoli già esistenti (descrizione aggiornata):", aggiornati);
}

main()
  .catch((e) => {
    console.error("ERRORE:", e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
