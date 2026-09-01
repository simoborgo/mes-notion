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
// La colonna "Bilancio di Massa" viene migrata grezza in bilancio_massa_raw E decodificata in
// tipo_bilancio_massa tramite la mappatura reale (TABELLA CATEGORIE VERNICI.pdf fornita
// dall'utente, 2026-08-09) — sigle non presenti in tabella (es. "0") restano solo grezze.
// "Nome Colore" (ex "DESCRIZIONE" nel formato storico) va in descrizione_colore, prevalendo
// sempre sulla deduzione euristica dal Codice Colore. "Fornitore" va nell'omonima colonna.
// Entrambi, come cliente_riferimento/tipo_bilancio_massa, vengono scritti solo in backfill
// (riga già presente con quel campo NULL) — mai sovrascritti se già valorizzati da UI.
//
// Uso:
//   node scripts/importa-vernici.mjs <path-csv>              -> dry-run: analizza e basta, non scrive
//   node scripts/importa-vernici.mjs <path-csv> --conferma    -> scrive davvero sul DB
//
// Di default gira sempre in sola analisi (nessuna query di scrittura, nessuna transazione aperta):
// mostra quante righe sarebbero nuove (con i relativi codice_inventario) e quante già presenti
// andrebbero solo a backfillare cliente_riferimento/tipo_bilancio_massa se mancanti. Per scrivere
// davvero va rilanciato con --conferma dopo aver controllato l'anteprima.
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

const args = process.argv.slice(2).filter(a => a !== "--conferma");
const CONFERMATO = process.argv.includes("--conferma");
const csvPath = args[0];
if (!csvPath) {
  console.error("Uso: node scripts/importa-vernici.mjs <path-csv> [--conferma]");
  process.exit(1);
}

const CLIENTI_VERNICIATURA = [
  "Gucci", "Armani", "Cartier", "Diesel", "Bottega Veneta",
  "Brioni", "Boucheron", "Mage", "Villa Giuseppina", "Valentino",
];

// Da "TABELLA CATEGORIE VERNICI.pdf" (fornita dall'utente, 2026-08-09). Sigle non presenti
// qui (es. "0") restano solo grezze in bilancio_massa_raw, non decodificate.
const CATEGORIE_BILANCIO_MASSA = {
  A: "ACETONE",
  F: "DILUENTE",
  B: "VERNICE ALL'ACQUA",
  D: "CATALIZZATORE ACRILICO",
  G: "VERNICE ACRILICA",
  L: "FONDO ACRILICO",
  E: "CATALIZZATORE POLIURETANICO",
  H: "VERNICE POLIURETANICA",
  N: "FONDO POLIURETANICO",
  M: "FONDO POLIESTERE",
  NO: "VERNICE NITRO",
  Q: "TINTA SOLVENTE",
};

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

// Non persiste più un "sistema colore" separato (colonna rimossa da vernici): serve solo a
// normalizzare la formattazione del codice colore libero (es. "RAL7016" -> "RAL 7016").
function classificaColore(raw) {
  const v = (raw || "").trim();
  if (!v) return { codice: null, nome: null };

  const compattaRal = v.toUpperCase().match(/^RAL\s*(\d+)/);
  if (compattaRal && compattaRal[1].length === 4) {
    return { codice: `RAL ${compattaRal[1]}`, nome: null };
  }

  const compattaNcs = v.toUpperCase().replace(/\s|-/g, "").match(/^NCS?S?(\d{4})([A-Z0-9]*)$/);
  if (compattaNcs) {
    const [, cifre, tinta] = compattaNcs;
    return { codice: tinta ? `NCS S${cifre}-${tinta}` : `NCS S${cifre}`, nome: null };
  }

  const pantone = v.toUpperCase().match(/^PANTONE\s*(.+)/);
  if (pantone) {
    return { codice: `PANTONE ${pantone[1].trim()}`, nome: null };
  }

  // Nessuna struttura riconosciuta (es. "TRASPARENTE", "VERDE PERGOLA", RAL con cifre errate,
  // ecc.): nome libero title-case.
  const nome = v.toLowerCase().split(/\s+/).map(p => p ? p[0].toUpperCase() + p.slice(1) : p).join(" ");
  return { codice: nome, nome };
}

async function main() {
  const testo = fs.readFileSync(csvPath, "utf8");
  const allRows = parseCsv(testo);

  // Riga 0 è uno scarto ("Tabella 1"), la vera intestazione è la riga 1 — "Cod. inventario" nel
  // formato storico, "Codice Inventario" nel formato OS1 aggiornato (2026-09-01, aggiunte anche
  // le colonne "Nome Colore" e "Fornitore").
  const headerIdx = allRows.findIndex(r => r.some(c => c.includes("Codice Inventario") || c.includes("Cod. inventario")));
  if (headerIdx === -1) {
    console.error('Intestazione "Codice Inventario" non trovata nel CSV: formato inatteso');
    process.exit(1);
  }
  const dati = allRows.slice(headerIdx + 1).filter(r => r.length >= 9 && r[1]?.trim());
  console.log("Righe da importare:", dati.length);

  // Analisi preventiva (sempre, anche in scrittura): classifica ogni riga del CSV contro lo stato
  // attuale del DB senza toccare nulla — serve sia per il dry-run sia come riepilogo "prima" da
  // confrontare col risultato finale.
  const esistenti = await pool.query(`SELECT codice_inventario, cliente_riferimento, tipo_bilancio_massa, descrizione_colore, fornitore FROM vernici WHERE codice_inventario IS NOT NULL`);
  const mappaEsistenti = new Map(esistenti.rows.map(r => [r.codice_inventario, r]));

  const nuovi = [];
  const daBackfillare = [];
  let invarianteAnteprima = 0;
  for (const r of dati) {
    const [bilancioMassaRawGrezzo, codiceInventario, nomeColore, , , , , cliente, , fornitoreRaw] = r;
    const codice = codiceInventario?.trim();
    if (!codice) continue;
    const rigaEsistente = mappaEsistenti.get(codice);
    if (!rigaEsistente) { nuovi.push(codice); continue; }
    const clienteRiferimentoNuovo = cliente?.trim() || null;
    const tipoBilancioNuovo = bilancioMassaRawGrezzo?.trim()
      ? (CATEGORIE_BILANCIO_MASSA[bilancioMassaRawGrezzo.trim().toUpperCase()] ?? null)
      : null;
    const descrizioneNuova = nomeColore?.trim() || null;
    const fornitoreNuovo = fornitoreRaw?.trim() || null;
    const cambiaCliente = rigaEsistente.cliente_riferimento === null && clienteRiferimentoNuovo !== null;
    const cambiaBilancio = rigaEsistente.tipo_bilancio_massa === null && tipoBilancioNuovo !== null;
    const cambiaDescrizione = rigaEsistente.descrizione_colore === null && descrizioneNuova !== null;
    const cambiaFornitore = rigaEsistente.fornitore === null && fornitoreNuovo !== null;
    if (cambiaCliente || cambiaBilancio || cambiaDescrizione || cambiaFornitore) daBackfillare.push(codice); else invarianteAnteprima++;
  }

  console.log("\n--- ANTEPRIMA (nessuna scrittura) ---");
  console.log("Vernici NUOVE da inserire:", nuovi.length, nuovi.length > 0 ? `(${nuovi.slice(0, 20).join(", ")}${nuovi.length > 20 ? ", …" : ""})` : "");
  console.log("Vernici esistenti da aggiornare (solo backfill cliente/bilancio massa mancanti):", daBackfillare.length);
  console.log("Vernici esistenti invariate:", invarianteAnteprima);

  if (!CONFERMATO) {
    console.log("\nNessuna scrittura eseguita (dry-run). Per applicare davvero: aggiungi --conferma in fondo al comando.");
    return;
  }
  console.log("\n--conferma presente: scrivo sul DB…");

  const clientiVisti = new Set();
  let bilancioDecodificato = 0, bilancioSconosciuto = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let inseriteONuove = 0, invariate = 0;
    for (const r of dati) {
      const [bilancioMassaRawGrezzo, codiceInventario, nomeColore, tipoVernice, codiceTintometro, colore, gloss, cliente, unitaMisuraRaw, fornitoreRaw] = r;

      const { codice: coloreCodice, nome: coloreNomeEuristico } = classificaColore(colore);
      // "Nome Colore" (ex "DESCRIZIONE") è testo libero reale dall'estratto OS1: quando presente
      // prevale sempre sulla deduzione euristica dal Codice Colore.
      const descrizioneColore = nomeColore?.trim() || coloreNomeEuristico;

      const umNorm = (unitaMisuraRaw || "").trim().toUpperCase();
      const unitaMisura = ["KG", "LT", "NR"].includes(umNorm) ? umNorm : null;

      let clienteRiferimento = null;
      if (cliente?.trim()) {
        const trovato = CLIENTI_VERNICIATURA.find(c => c.toLowerCase() === cliente.trim().toLowerCase());
        clienteRiferimento = trovato || cliente.trim();
        clientiVisti.add(clienteRiferimento);
      }

      const fornitore = fornitoreRaw?.trim() || null;

      const bilancioMassaRaw = bilancioMassaRawGrezzo?.trim() || null;
      const tipoBilancioMassa = bilancioMassaRaw ? (CATEGORIE_BILANCIO_MASSA[bilancioMassaRaw.toUpperCase()] ?? null) : null;
      if (bilancioMassaRaw) { if (tipoBilancioMassa) bilancioDecodificato++; else bilancioSconosciuto++; }

      // Rieseguibile: su una riga già presente (stesso codice_inventario) fa solo backfill dei
      // campi rimasti NULL (cliente_riferimento/tipo_bilancio_massa/descrizione_colore/fornitore)
      // — non sovrascrive mai modifiche fatte medio tempore da UI.
      const { rows: risultato } = await client.query(
        `INSERT INTO vernici
           (colore_codice, descrizione_colore, codice_tintometro, codice_inventario,
            unita_misura, tipologia, tipo_bilancio_massa, bilancio_massa_raw, gloss, cliente_riferimento, fornitore)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (codice_inventario) WHERE codice_inventario IS NOT NULL
         DO UPDATE SET
           cliente_riferimento = EXCLUDED.cliente_riferimento,
           tipo_bilancio_massa = COALESCE(vernici.tipo_bilancio_massa, EXCLUDED.tipo_bilancio_massa),
           descrizione_colore = COALESCE(vernici.descrizione_colore, EXCLUDED.descrizione_colore),
           fornitore = COALESCE(vernici.fornitore, EXCLUDED.fornitore)
           WHERE (vernici.cliente_riferimento IS NULL AND EXCLUDED.cliente_riferimento IS NOT NULL)
              OR (vernici.tipo_bilancio_massa IS NULL AND EXCLUDED.tipo_bilancio_massa IS NOT NULL)
              OR (vernici.descrizione_colore IS NULL AND EXCLUDED.descrizione_colore IS NOT NULL)
              OR (vernici.fornitore IS NULL AND EXCLUDED.fornitore IS NOT NULL)
         RETURNING id`,
        [
          coloreCodice,
          descrizioneColore,
          codiceTintometro?.trim() || null,
          codiceInventario.trim(),
          unitaMisura,
          (tipoVernice || "").trim() || "NON CLASSIFICATO",
          tipoBilancioMassa,
          bilancioMassaRaw,
          gloss?.trim() || null,
          clienteRiferimento,
          fornitore,
        ]
      );
      if (risultato.length > 0) inseriteONuove++; else invariate++;
    }

    await client.query("COMMIT");
    console.log("\n--- RISULTATO ---");
    console.log("Vernici inserite o aggiornate (nuove + backfill cliente_riferimento/bilancio_massa):", inseriteONuove);
    console.log("Invariate (già presenti, nulla da aggiornare):", invariate);
    console.log("Bilancio di Massa decodificato:", bilancioDecodificato, "| sigla sconosciuta (solo grezzo):", bilancioSconosciuto);
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
