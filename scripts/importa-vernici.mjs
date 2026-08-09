// Import una tantum: popola `vernici` da ETICHETTE_VERNICI_estratto.csv (catalogo reale,
// 569 righe, separatore ';'). A differenza di importa-anagrafica-ferramenta.mjs NON fa
// TRUNCATE: usa ON CONFLICT (codice_inventario) DO NOTHING, perché a differenza di
// articoli_ferramenta questa tabella può già essere referenziata da cicli_fasi_prodotti/
// campionature al momento di un rerun — uno svuotamento a cascata perderebbe dati di
// produzione reali, non solo l'anagrafica importata.
//
// fornitore_id/laboratorio_id restano NULL (assegnazione progressiva successiva, decisione
// esplicita). La colonna "Cliente" del CSV va in vernici.cliente_riferimento — puramente
// informativo/storico (Vernici resta anagrafica indipendente dal cliente per decisione
// esplicita, il vero legame strutturale è su Campionature), ma è l'unico modo per non perdere
// questa informazione finché non esistono ancora cicli/campionature reali per queste vernici
// migrate dal CSV. Rieseguibile: sulle righe già presenti (stesso codice_inventario) fa solo
// da backfill di cliente_riferimento se era rimasto NULL, non tocca altro.
// La colonna "Bilancio di Massa" viene migrata grezza in bilancio_massa_raw: la mappatura
// verso tipo_bilancio_massa (solvente/acqua/polvere/primer/smalto/altro) non è ancora nota
// e va completata in un secondo momento.
//
// Uso: node scripts/importa-vernici.mjs <path-csv>
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
  ssl: env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
});

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Uso: node scripts/importa-vernici.mjs <path-csv>");
  process.exit(1);
}

const CLIENTI_VERNICIATURA = [
  "Gucci", "Armani", "Cartier", "Diesel", "Bottega Veneta",
  "Brioni", "Boucheron", "Mage", "Villa Giuseppina", "Valentino",
];

// Parser CSV minimale RFC4180 con separatore ';' (stesso approccio di
// importa-anagrafica-ferramenta.mjs, adattato al delimitatore di questo estratto).
function parseCsv(text, delimiter = ";") {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function classificaColore(raw) {
  const v = (raw || "").trim();
  if (!v) return { sistema: null, codice: null, nome: null };

  const compattaRal = v.toUpperCase().match(/^RAL\s*(\d+)/);
  if (compattaRal && compattaRal[1].length === 4) {
    return { sistema: "RAL", codice: `RAL ${compattaRal[1]}`, nome: null };
  }

  const compattaNcs = v.toUpperCase().replace(/\s|-/g, "").match(/^NCS?S?(\d{4})([A-Z0-9]*)$/);
  if (compattaNcs) {
    const [, cifre, tinta] = compattaNcs;
    return { sistema: "NCS", codice: tinta ? `NCS S${cifre}-${tinta}` : `NCS S${cifre}`, nome: null };
  }

  const pantone = v.toUpperCase().match(/^PANTONE\s*(.+)/);
  if (pantone) {
    return { sistema: "Pantone", codice: `PANTONE ${pantone[1].trim()}`, nome: null };
  }

  // Custom: nome libero title-case, nessuna struttura riconosciuta (es. "TRASPARENTE",
  // "VERDE PERGOLA", "PANTONE 9224C" malformato, RAL con cifre errate, ecc.)
  const nome = v.toLowerCase().split(/\s+/).map(p => p ? p[0].toUpperCase() + p.slice(1) : p).join(" ");
  return { sistema: "Custom", codice: nome, nome };
}

async function main() {
  const testo = fs.readFileSync(csvPath, "utf8");
  const allRows = parseCsv(testo);

  // Riga 0 è uno scarto ("Tabella 1"), la vera intestazione è la riga 1.
  const headerIdx = allRows.findIndex(r => r.some(c => c.includes("Cod. inventario")));
  if (headerIdx === -1) {
    console.error('Intestazione "Cod. inventario" non trovata nel CSV: formato inatteso');
    process.exit(1);
  }
  const dati = allRows.slice(headerIdx + 1).filter(r => r.length >= 9 && r[1]?.trim());
  console.log("Righe da importare:", dati.length);

  const clientiVisti = new Set();
  let bilancioIgnoto = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let inseriteONuove = 0, invariate = 0;
    for (const r of dati) {
      const [bilancioMassaRaw, codiceInventario, , tipoVernice, codiceTintometro, colore, gloss, cliente, unitaMisuraRaw] = r;

      const { sistema: coloreSistema, codice: coloreCodice, nome: coloreNome } = classificaColore(colore);

      const umNorm = (unitaMisuraRaw || "").trim().toUpperCase();
      const unitaMisura = ["KG", "LT", "NR"].includes(umNorm) ? umNorm : null;

      let clienteRiferimento = null;
      if (cliente?.trim()) {
        const trovato = CLIENTI_VERNICIATURA.find(c => c.toLowerCase() === cliente.trim().toLowerCase());
        clienteRiferimento = trovato || cliente.trim();
        clientiVisti.add(clienteRiferimento);
      }
      if (bilancioMassaRaw?.trim()) bilancioIgnoto++;

      // Rieseguibile: su una riga già presente (stesso codice_inventario) fa solo backfill di
      // cliente_riferimento se era NULL — non sovrascrive modifiche fatte medio tempore da UI.
      const { rows: risultato } = await client.query(
        `INSERT INTO vernici
           (colore_sistema, colore_codice, colore_nome, codice_tintometro, codice_inventario,
            unita_misura, famiglia_prodotto, tipo_bilancio_massa, bilancio_massa_raw, gloss, cliente_riferimento)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,$10)
         ON CONFLICT (codice_inventario) WHERE codice_inventario IS NOT NULL
         DO UPDATE SET cliente_riferimento = EXCLUDED.cliente_riferimento
           WHERE vernici.cliente_riferimento IS NULL AND EXCLUDED.cliente_riferimento IS NOT NULL
         RETURNING id`,
        [
          coloreSistema,
          coloreCodice,
          coloreNome,
          codiceTintometro?.trim() || null,
          codiceInventario.trim(),
          unitaMisura,
          (tipoVernice || "").trim() || "NON CLASSIFICATO",
          bilancioMassaRaw?.trim() || null,
          gloss?.trim() || null,
          clienteRiferimento,
        ]
      );
      if (risultato.length > 0) inseriteONuove++; else invariate++;
    }

    await client.query("COMMIT");
    console.log("\n--- RISULTATO ---");
    console.log("Vernici inserite o aggiornate (nuove + backfill cliente_riferimento):", inseriteONuove);
    console.log("Invariate (già presenti, nulla da aggiornare):", invariate);
    console.log("Righe con Bilancio di Massa non decodificato (migrato grezzo):", bilancioIgnoto);
    console.log("Clienti visti nel CSV (migrati in cliente_riferimento):", [...clientiVisti].sort().join(", "));
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
