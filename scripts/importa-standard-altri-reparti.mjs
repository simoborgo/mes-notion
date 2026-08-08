// Import una tantum (correzione, sessione 2026-08-08): completa standard_reparto per gli
// articoli seminati da importa-standard-verniciatura.mjs. Quello script usava solo la colonna
// "H INT-VERN" del CSV come unica riga per articolo — ma essendo l'unica riga, oreReparto()
// (capacityPlannerRepository.ts) calcolava il rapporto sul totale delle righe TROVATE, non sul
// vero totale storico: per articoli dove Verniciatura era solo una minoranza delle ore reali
// (es. RX013-A: H TOTALI 156,5 / H INT-VERN 49,5 = 32%), il 100% delle ore finiva comunque su
// Verniciatura. La colonna "H TOTALI" del CSV, scartata dal primo import, conteneva il segnale
// mancante.
//
// Non sappiamo quale reparto specifico coprisse la differenza (H TOTALI - H INT-VERN) — il CSV
// non lo dice. Deciso con l'utente (sessione 2026-08-08) uno split fisso, uguale per tutti gli
// articoli, sulla differenza: Falegnameria 40%, CNC 40%, Assemblaggio 10%, Sezionatura 10%.
// Imballaggio e Cablaggi esclusi di proposito (non indicati dall'utente).
//
// Verniciatura NON viene ricalcolata qui (stesso valore già seminato dal primo script, stessa
// logica di media sulle occorrenze con H INT-VERN > 0) — questo script aggiunge solo le righe
// mancanti per gli altri 4 reparti, mai un update se esiste già un consuntivo reale (ON CONFLICT
// ... WHERE origine = 'stimato', mai sovrascrive un'osservazione vera).
//
// Uso: node scripts/importa-standard-altri-reparti.mjs [percorso-csv]
import fs from "node:fs";
import pg from "pg";

const SPLIT_RESTO = {
  Falegnameria: 0.40,
  CNC: 0.40,
  Assemblaggio: 0.10,
  Sezionatura: 0.10,
};

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

  const perCodice = new Map(); // codice -> { totali: [...], intVern: [...] }
  let saltate = 0;

  for (const riga of datiRighe) {
    const campi = riga.split(";");
    if (campi.length < 6) { saltate++; continue; }
    const [commessa, codice, , , oreTotaliRaw, oreIntVernRaw] = campi;
    if (!codice || !codice.trim() || commessa.trim().startsWith("TOTALE")) { saltate++; continue; }

    const oreTotali = parseOre(oreTotaliRaw);
    const oreIntVern = parseOre(oreIntVernRaw);
    if (!(oreTotali > 0)) continue; // niente su cui basare uno split

    const codiceTrim = codice.trim();
    if (!perCodice.has(codiceTrim)) perCodice.set(codiceTrim, { totali: [], intVern: [] });
    const entry = perCodice.get(codiceTrim);
    entry.totali.push(oreTotali);
    entry.intVern.push(oreIntVern);
  }

  console.log("righe dati lette:", datiRighe.length, "— saltate (totale/vuote/senza ore):", saltate);
  console.log("codici con H TOTALI > 0:", perCodice.size);

  const { rows: articoliEsistenti } = await pool.query(`SELECT codice_articolo FROM articoli`);
  const setArticoli = new Set(articoliEsistenti.map(r => r.codice_articolo));

  let inseriti = 0;
  let saltatiNoArticolo = 0;
  let saltatiRestoZero = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [codice, { totali, intVern }] of perCodice) {
      if (!setArticoli.has(codice)) { saltatiNoArticolo++; continue; }

      const mediaTotali = totali.reduce((s, v) => s + v, 0) / totali.length;
      const mediaIntVern = intVern.reduce((s, v) => s + v, 0) / intVern.length;
      const resto = Math.max(0, mediaTotali - mediaIntVern);
      if (resto <= 0) { saltatiRestoZero++; continue; }

      for (const [reparto, quota] of Object.entries(SPLIT_RESTO)) {
        const mediaOre = resto * quota;
        const { rowCount } = await client.query(
          `INSERT INTO standard_reparto (codice_articolo, reparto, media_ore, somma_scarti_quadrati, n_osservazioni, origine)
           VALUES ($1, $2, $3, 0, 0, 'stimato')
           ON CONFLICT (codice_articolo, reparto) DO UPDATE SET media_ore = EXCLUDED.media_ore, aggiornato_il = now()
           WHERE standard_reparto.origine = 'stimato'`,
          [codice, reparto, mediaOre]
        );
        if (rowCount > 0) inseriti++;
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  console.log("\n--- RISULTATO ---");
  console.log("righe inserite/aggiornate (4 reparti x articoli con resto > 0):", inseriti);
  console.log("codici con H TOTALI ma non presenti in articoli (saltati):", saltatiNoArticolo);
  console.log("codici dove H TOTALI = H INT-VERN, nessun resto da ripartire (saltati):", saltatiRestoZero);
}

main()
  .catch((e) => {
    console.error("ERRORE:", e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
