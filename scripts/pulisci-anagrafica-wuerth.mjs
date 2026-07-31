// Pulizia una tantum: unifica gli articoli Ferramenta con fornitore "WUERTH s.r.l." (grafia
// alternativa nel tracciato/OS1) che non risultano collegati al Fornitore Notion corretto.
// Non tocca fornitore_nome_os1 (rispecchia la dicitura esatta usata da OS1/dal fornitore).
// Ripetibile in sicurezza: la seconda esecuzione non trova più righe da correggere.
// Uso: node scripts/pulisci-anagrafica-wuerth.mjs
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

async function main() {
  const rif = await pool.query(
    "SELECT DISTINCT fornitore_id, fornitore_nome FROM articoli_ferramenta WHERE fornitore_nome = 'WURTH s.r.l.'"
  );
  if (rif.rows.length !== 1 || !rif.rows[0].fornitore_id) {
    throw new Error(`Riferimento WURTH non univoco o mancante: ${JSON.stringify(rif.rows)}`);
  }
  const { fornitore_id } = rif.rows[0];
  console.log("fornitore_id di riferimento (WURTH s.r.l.):", fornitore_id);

  const prima = await pool.query(
    "SELECT count(*) FROM articoli_ferramenta WHERE fornitore_nome_os1 ILIKE '%wuerth%' AND (fornitore_nome = '' OR fornitore_nome IS NULL)"
  );
  console.log("righe da correggere:", prima.rows[0].count);

  const upd = await pool.query(
    `UPDATE articoli_ferramenta
     SET fornitore_id = $1, fornitore_nome = 'WURTH s.r.l.', aggiornato_il = now()
     WHERE fornitore_nome_os1 ILIKE '%wuerth%' AND (fornitore_nome = '' OR fornitore_nome IS NULL)`,
    [fornitore_id]
  );
  console.log("righe aggiornate:", upd.rowCount);

  const dopo = await pool.query(
    "SELECT count(*) FROM articoli_ferramenta WHERE fornitore_nome_os1 ILIKE '%w_erth%' AND (fornitore_nome = '' OR fornitore_nome IS NULL)"
  );
  console.log("righe ancora scollegate dopo il fix (atteso 0):", dopo.rows[0].count);

  const tot = await pool.query(
    "SELECT count(*) FROM articoli_ferramenta WHERE fornitore_nome ILIKE '%wurth%'"
  );
  console.log("totale articoli ora collegati a WURTH s.r.l.:", tot.rows[0].count);
}

main()
  .catch((e) => {
    console.error("ERRORE:", e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
