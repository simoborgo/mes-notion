import { pool } from "./db";
import type { ArrivoCommessa } from "./arrivoDisegniCalc";

// Arrivo dei disegni per commessa: ogni riga di `schede` Scheda/Sottoscheda è un disegno (una
// pagina del PDF importato), il giorno di arrivo è data_scheda_ricevuta. Escluse archiviate,
// annullate e rilavorazioni (non sono disegni nuovi arrivati). Le schede senza data restano
// contate a parte: senza giorno non si possono collocare sull'asse del tempo.
export async function getArrivoDisegni(commessaIds: string[]): Promise<Map<string, ArrivoCommessa>> {
  const out = new Map<string, ArrivoCommessa>(
    commessaIds.map(id => [id, { commessaId: id, giorni: [], senzaData: 0, totale: 0, completate: 0 }]),
  );
  if (commessaIds.length === 0) return out;

  const { rows } = await pool.query(
    `SELECT commessa_id,
            to_char(data_scheda_ricevuta, 'YYYY-MM-DD') AS giorno,
            count(*)::int AS n,
            (count(*) FILTER (WHERE stato = 'Completato'))::int AS completate,
            array_agg(DISTINCT odp ORDER BY odp) AS odp
       FROM schede
      WHERE commessa_id = ANY($1::uuid[])
        AND archiviata = false
        AND stato <> 'Annullata'
        AND tipologia IN ('Scheda', 'Sottoscheda')
      GROUP BY commessa_id, 2
      ORDER BY commessa_id, 2`,
    [commessaIds],
  );

  for (const r of rows) {
    const c = out.get(r.commessa_id);
    if (!c) continue;
    c.totale += r.n;
    c.completate += r.completate;
    if (r.giorno) c.giorni.push({ giorno: r.giorno, n: r.n, completate: r.completate, odp: r.odp });
    else c.senzaData += r.n;
  }
  return out;
}
