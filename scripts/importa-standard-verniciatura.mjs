// Import una tantum (Fase 5.0, modulo Offerte/Storico/Previsionale): semina standard_reparto
// con origine='stimato' per il reparto Verniciatura, dalla colonna "H INT-VERN" dello storico
// "Codici Valorizzati" — l'unico reparto per cui il CSV ha un numero specifico (H TOTALI non è
// scomposto sugli altri 6 reparti, niente split percentuale inventato per quelli).
//
// Se lo stesso codice compare su più commesse, la MEDIA delle occorrenze con H INT-VERN > 0
// è la stima di partenza più ragionevole (n_osservazioni resta 0: è uno stimato, non
// un'osservazione vera — coerente con registraChiusuraOdp che lo sostituisce di netto alla
// prima chiusura reale, mai lo media con un consuntivo).
//
// Uso: node scripts/importa-standard-verniciatura.mjs [percorso-csv]
import fs from "node:fs";
import pg from "pg";

const REPARTO = "Verniciatura";

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

function parseOre(v) {
  return Number(v.trim().replace(",", "."));
}

async function main() {
  const testo = fs.readFileSync(csvPath, "utf8");
  const righe = testo.split("\n").map(r => r.trimEnd()).filter(r => r.length > 0);
  const datiRighe = righe.slice(2); // riga 0 = titolo, riga 1 = header

  const perCodice = new Map(); // codice -> [ore_int_vern, ...]
  let saltate = 0;

  for (const riga of datiRighe) {
    const campi = riga.split(";");
    if (campi.length < 6) { saltate++; continue; }
    const [commessa, codice, , , , oreIntVernRaw] = campi;
    if (!codice || !codice.trim() || commessa.trim().startsWith("TOTALE")) { saltate++; continue; }

    const oreIntVern = parseOre(oreIntVernRaw);
    if (!(oreIntVern > 0)) continue; // niente verniciatura interna per questa occorrenza

    const codiceTrim = codice.trim();
    if (!perCodice.has(codiceTrim)) perCodice.set(codiceTrim, []);
    perCodice.get(codiceTrim).push(oreIntVern);
  }

  console.log("righe dati lette:", datiRighe.length, "— saltate (totale/vuote):", saltate);
  console.log("codici con H INT-VERN > 0:", perCodice.size);

  const { rows: articoliEsistenti } = await pool.query(`SELECT codice_articolo FROM articoli`);
  const setArticoli = new Set(articoliEsistenti.map(r => r.codice_articolo));

  let inseriti = 0;
  let saltatiNoArticolo = 0;
  for (const [codice, valori] of perCodice) {
    if (!setArticoli.has(codice)) { saltatiNoArticolo++; continue; }
    const media = valori.reduce((s, v) => s + v, 0) / valori.length;
    const { rowCount } = await pool.query(
      `INSERT INTO standard_reparto (codice_articolo, reparto, media_ore, somma_scarti_quadrati, n_osservazioni, origine)
       VALUES ($1, $2, $3, 0, 0, 'stimato')
       ON CONFLICT (codice_articolo, reparto) DO NOTHING`,
      [codice, REPARTO, media]
    );
    if (rowCount > 0) inseriti++;
  }

  console.log("\n--- RISULTATO ---");
  console.log("righe inserite in standard_reparto (Verniciatura, stimato):", inseriti);
  console.log("codici con H INT-VERN ma non presenti in articoli (saltati):", saltatiNoArticolo);
}

main()
  .catch((e) => {
    console.error("ERRORE:", e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
