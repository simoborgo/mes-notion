// Import una tantum (2026-08-09): backfill di ore CNC storiche (giugno-agosto 2026) tenute a
// parte in un foglio manuale, prima che il reparto CNC iniziasse a registrare da Rilevamento Ore.
// Scrive direttamente in ore_registrate con ON CONFLICT (data, matricola, odp) DO NOTHING — non
// sovrascrive mai una riga già presente (i giorni più recenti del file si sovrappongono a ore già
// inserite dal vero flusso app/tablet, verificato prima di lanciare questo script). Dopo l'insert,
// richiama aggiornaStandardRepartoPerOdp per ogni ODP toccato — stessa funzione usata da ogni
// scrittura live, aggiorna storico_consuntivo_articolo e la media Welford in standard_reparto.
//
// Uso: npx tsx scripts/importa-storico-cnc.ts [--dry-run]
import fs from "node:fs";
import { pool } from "../src/lib/db";
import { aggiornaStandardRepartoPerOdp } from "../src/lib/standardRepartoRepository";

const MESI: Record<string, number> = {
  GENNAIO: 1, FEBBRAIO: 2, MARZO: 3, APRILE: 4, MAGGIO: 5, GIUGNO: 6,
  LUGLIO: 7, AGOSTO: 8, SETTEMBRE: 9, OTTOBRE: 10, NOVEMBRE: 11, DICEMBRE: 12,
};

const OPERATORI: Record<string, { matricola: string; cognome: string; nome: string; azienda: string }> = {
  "ANDREA FERA": { matricola: "DIP-0055", cognome: "Fera", nome: "Andrea", azienda: "MODAR" },
  "POPA STEFANO": { matricola: "DIP-0022", cognome: "Popa", nome: "Stefano", azienda: "MODAR" },
  "RISO ALESSIO": { matricola: "DIP-0021", cognome: "Riso", nome: "Alessio", azienda: "MODAR" },
  "OLTOLINI ALESSANDRO": { matricola: "DIP-0013", cognome: "Oltolini", nome: "Alessandro", azienda: "MODAR" },
};

function parseGiorno(g: string): string {
  const [gg, mese, aa] = g.trim().split(" ");
  const meseNum = MESI[mese];
  if (!meseNum) throw new Error(`Mese non riconosciuto: "${mese}" (riga: "${g}")`);
  return `${aa}-${String(meseNum).padStart(2, "0")}-${String(gg).padStart(2, "0")}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const csvPath = new URL("../Operatore ODP Ore-Tabella 1.csv", import.meta.url);
  const testo = fs.readFileSync(csvPath, "utf8");
  const righe = testo.split("\n").map(r => r.trimEnd()).filter(r => r.length > 0);
  const dati = righe.slice(1); // riga 0 = header

  let inserite = 0, saltate = 0;
  const odpToccati = new Set<string>();

  for (const riga of dati) {
    const [operatoreNome, odpRaw, giorno, oreRaw] = riga.split(";");
    if (operatoreNome === "TOTALE") continue;
    const op = OPERATORI[operatoreNome];
    if (!op) throw new Error(`Operatore non mappato: "${operatoreNome}"`);
    const odp = odpRaw.trim();
    const data = parseGiorno(giorno);
    const ore = Number(oreRaw.replace(",", "."));
    if (!(ore > 0)) throw new Error(`Ore non valide "${oreRaw}" per ${operatoreNome} ${odp} ${giorno}`);

    if (dryRun) {
      const { rows } = await pool.query(
        `SELECT 1 FROM ore_registrate WHERE data = $1 AND matricola = $2 AND odp = $3`,
        [data, op.matricola, odp]
      );
      if (rows.length > 0) { saltate++; continue; }
      inserite++;
      odpToccati.add(odp);
      continue;
    }

    const { rowCount } = await pool.query(
      `INSERT INTO ore_registrate (data, matricola, cognome, nome, azienda, reparto, odp, categoria, ore, rif, causale, note, costo_rif)
       VALUES ($1,$2,$3,$4,$5,'CNC',$6,'COMMESSA',$7,false,NULL,NULL,NULL)
       ON CONFLICT (data, matricola, odp) DO NOTHING`,
      [data, op.matricola, op.cognome, op.nome, op.azienda, odp, ore]
    );
    if ((rowCount ?? 0) > 0) { inserite++; odpToccati.add(odp); }
    else saltate++;
  }

  console.log(`${dryRun ? "[DRY RUN] " : ""}Inserite: ${inserite} | saltate (già presenti): ${saltate} | ODP toccati: ${odpToccati.size}`);

  if (!dryRun) {
    let ok = 0, err = 0;
    for (const odp of odpToccati) {
      try {
        await aggiornaStandardRepartoPerOdp(odp);
        ok++;
      } catch (e) {
        err++;
        console.error(`Errore standard_reparto per ${odp}:`, e);
      }
    }
    console.log(`standard_reparto ricalcolato per ${ok} ODP (errori: ${err})`);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
