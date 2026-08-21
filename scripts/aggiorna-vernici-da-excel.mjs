// Aggiornamento vernici da nuovo estratto Excel (2026-08-21), sostituisce l'import CSV una
// tantum di importa-vernici.mjs con un merge più fine, perché il nuovo file NON è un dump
// completo indipendente: alcune colonne vanno prese sempre dal file, altre solo come backfill
// di valori mancanti, altre ancora vanno lasciate intatte a DB. Regole decise con l'utente:
//
// - descrizione_colore / colore_codice (colonna rinominata da colore_nome il 2026-08-21, non
//   descriveva più un "nome colore" ma la descrizione completa dell'articolo): sempre dal file
//   (colore_codice ri-normalizzato con la stessa
//   logica RAL/NCS/PANTONE di importa-vernici.mjs, perché il file ha "NCS S3560G" senza
//   trattino mentre il DB usa "NCS S3560-G" — sono lo stesso codice, non un conflitto).
// - codice_tintometro: SOLO backfill (il file ha aggiunto valori dove prima erano vuoti; non
//   sovrascrive un valore già presente — un caso verificato, 301936, aveva "516" nel file contro
//   "00516" a DB, quasi certo artefatto di Excel che tratta il campo come numero perdendo lo
//   zero iniziale).
// - bilancio_massa_raw / tipo_bilancio_massa: MAI toccati. Il file non contiene questa
//   informazione (colonna "Bilancio Massa" vuota su tutte le righe); resta quanto già a DB.
// - tipologia / gloss / unita_misura / cliente_riferimento / fornitore: dal file se valorizzato,
//   altrimenti resta il valore DB (il file non è un dump completo, alcune righe hanno celle
//   vuote per campi che a DB erano già popolati).
// - fornitore è testo libero su vernici (non FK verso la tabella fornitori, che è l'anagrafica
//   acquisti/ferramenta): si scrive il nome così com'è nel file.
// - Codici presenti a DB ma assenti dal nuovo file: attivo = false (non cancellati).
//
// Rieseguibile: le regole di merge sopra sono idempotenti riga per riga.
//
// Uso: node scripts/aggiorna-vernici-da-excel.mjs <path-xlsx>
import fs from "node:fs";
import pg from "pg";
import ExcelJS from "exceljs";

const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
});

const xlsxPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!xlsxPath) {
  console.error("Uso: node scripts/aggiorna-vernici-da-excel.mjs <path-xlsx> [--dry-run]");
  process.exit(1);
}

const CLIENTI_VERNICIATURA = [
  "Gucci", "Armani", "Cartier", "Diesel", "Bottega Veneta",
  "Brioni", "Boucheron", "Mage", "Villa Giuseppina", "Valentino",
];

// Stessa logica di normalizzazione di importa-vernici.mjs, ridotta al solo codice_codice: il
// nuovo file fornisce già "Nome Colore" come colonna esplicita, non va più derivato dal codice.
function normalizzaColoreCodice(raw) {
  const v = (raw || "").toString().trim();
  if (!v) return null;

  const compattaRal = v.toUpperCase().match(/^RAL\s*(\d+)/);
  if (compattaRal && compattaRal[1].length === 4) return `RAL ${compattaRal[1]}`;

  const compattaNcs = v.toUpperCase().replace(/\s|-/g, "").match(/^NCS?S?(\d{4})([A-Z0-9]*)$/);
  if (compattaNcs) {
    const [, cifre, tinta] = compattaNcs;
    return tinta ? `NCS S${cifre}-${tinta}` : `NCS S${cifre}`;
  }

  const pantone = v.toUpperCase().match(/^PANTONE\s*(.+)/);
  if (pantone) return `PANTONE ${pantone[1].trim()}`;

  return v.toLowerCase().split(/\s+/).map(p => p ? p[0].toUpperCase() + p.slice(1) : p).join(" ");
}

function cella(row, colIndex) {
  if (!colIndex) return null;
  const raw = row.getCell(colIndex).value;
  const testo = (raw ?? "").toString().trim();
  return testo || null;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const sheet = wb.worksheets[0];

  let headerRowIdx = -1;
  const colIndex = {};
  for (let i = 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    let trovato = false;
    row.eachCell((cell, col) => {
      const testo = (cell.value ?? "").toString().trim();
      if (testo === "Codice Inventario") trovato = true;
      if (testo) colIndex[testo] = col;
    });
    if (trovato) { headerRowIdx = i; break; }
  }
  if (headerRowIdx === -1) {
    console.error('Intestazione "Codice Inventario" non trovata nel foglio: formato inatteso');
    process.exit(1);
  }
  for (const nome of ["Codice Inventario", "Nome Colore", "Tipologia", "Codice Tintometro", "Codice Colore", "Gloss", "Cliente Riferimento", "Unità Misura", "Fornitore"]) {
    if (!colIndex[nome]) { console.error(`Colonna mancante nel file: "${nome}"`); process.exit(1); }
  }

  const righe = [];
  for (let i = headerRowIdx + 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const codiceInventario = cella(row, colIndex["Codice Inventario"]);
    if (!codiceInventario) continue;
    righe.push({ row, codiceInventario });
  }
  console.log("Righe da elaborare:", righe.length);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let inserite = 0, aggiornate = 0;
    const codiciVisti = [];
    for (const { row, codiceInventario } of righe) {
      codiciVisti.push(codiceInventario);

      const nomeColore = cella(row, colIndex["Nome Colore"]);
      const codiceColoreRaw = cella(row, colIndex["Codice Colore"]);
      const coloreCodice = normalizzaColoreCodice(codiceColoreRaw);
      const tintometro = cella(row, colIndex["Codice Tintometro"]);
      const tipologia = cella(row, colIndex["Tipologia"]);
      const gloss = cella(row, colIndex["Gloss"]);
      const umRaw = cella(row, colIndex["Unità Misura"]);
      const unitaMisura = umRaw && ["KG", "LT", "NR"].includes(umRaw.toUpperCase()) ? umRaw.toUpperCase() : null;
      const fornitore = cella(row, colIndex["Fornitore"]);

      let clienteRiferimento = cella(row, colIndex["Cliente Riferimento"]);
      if (clienteRiferimento) {
        const trovato = CLIENTI_VERNICIATURA.find(c => c.toLowerCase() === clienteRiferimento.toLowerCase());
        clienteRiferimento = trovato || clienteRiferimento;
      }

      const { rows: risultato } = await client.query(
        `INSERT INTO vernici
           (colore_codice, descrizione_colore, codice_tintometro, codice_inventario,
            unita_misura, tipologia, gloss, cliente_riferimento, fornitore)
         VALUES ($1,$2,$3,$4,$5, COALESCE($6, 'NON CLASSIFICATO'), $7,$8,$9)
         ON CONFLICT (codice_inventario) WHERE codice_inventario IS NOT NULL
         DO UPDATE SET
           colore_codice = COALESCE($1, vernici.colore_codice),
           descrizione_colore = COALESCE($2, vernici.descrizione_colore),
           codice_tintometro = COALESCE(vernici.codice_tintometro, $3),
           unita_misura = COALESCE($5, vernici.unita_misura),
           tipologia = COALESCE($6, vernici.tipologia, 'NON CLASSIFICATO'),
           gloss = COALESCE($7, vernici.gloss),
           cliente_riferimento = COALESCE($8, vernici.cliente_riferimento),
           fornitore = COALESCE($9, vernici.fornitore)
         RETURNING (xmax = 0) AS inserted`,
        [coloreCodice, nomeColore, tintometro, codiceInventario, unitaMisura, tipologia, gloss, clienteRiferimento, fornitore]
      );
      if (risultato[0].inserted) inserite++; else aggiornate++;
    }

    const { rowCount: disattivate } = await client.query(
      `UPDATE vernici SET attivo = false
       WHERE attivo = true AND codice_inventario IS NOT NULL AND NOT (codice_inventario = ANY($1::text[]))`,
      [codiciVisti]
    );

    if (dryRun) {
      await client.query("ROLLBACK");
      console.log("\n--- RISULTATO (DRY RUN, nessuna modifica applicata) ---");
    } else {
      await client.query("COMMIT");
      console.log("\n--- RISULTATO ---");
    }
    console.log("Vernici inserite (nuovi codici):", inserite);
    console.log("Vernici aggiornate (merge su codici esistenti):", aggiornate);
    console.log("Vernici disattivate (assenti dal nuovo file):", disattivate);
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
