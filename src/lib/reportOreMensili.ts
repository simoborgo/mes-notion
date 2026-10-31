import { pool, dateToStr } from "./db";
import { ATTIVITA_SPECIALI_COMMESSA } from "./attivitaSpecialiCommessa";

export interface RigaOreMensili {
  commessa: string;
  odp: string;
  codiceArticolo: string;
  matricola: string;
  operatore: string;
  data: string;
  ore: number;
  tipo: "Interno" | "Esterno";
  azienda: string;
  reparto: string;
  categoria: string;
  rifacimento: boolean;
}

// Commessa di una riga ore: via scheda (ODP -> commessa_id); per le attività speciali di commessa
// (pseudo-ODP "NUMERO-SUFFISSO", senza scheda) dal prefisso. Le causali di stabilimento
// (Setup, Manutenzione, ...) vanno tutte sulla commessa interna di produzione dell'anno: PROD26, PROD27, ...
export async function buildOreMensiliReport(da: string, a: string): Promise<RigaOreMensili[]> {
  const { rows } = await pool.query(
    `SELECT o.data, o.matricola, o.cognome, o.nome, o.azienda, o.reparto, o.odp, o.categoria, o.ore, o.rif,
            op.tipo AS operatore_tipo, sc.commessa_nr, sc.codice_articolo
     FROM ore_registrate o
     LEFT JOIN operatori op ON op.matricola = o.matricola
     LEFT JOIN LATERAL (
       SELECT c.numero_commessa AS commessa_nr, s.codice_articolo FROM schede s
       LEFT JOIN commesse c ON c.id = s.commessa_id
       WHERE s.odp = o.odp ORDER BY c.id IS NULL, s.archiviata, s.tipologia = 'Scheda' DESC LIMIT 1
     ) sc ON true
     WHERE o.data BETWEEN $1 AND $2
     ORDER BY o.data, o.cognome, o.nome, o.odp`,
    [da, a],
  );
  const suffissi = ATTIVITA_SPECIALI_COMMESSA.map(x => `-${x.suffix}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => {
    const data: string = r.data instanceof Date ? dateToStr(r.data) : r.data;
    let commessa: string = r.commessa_nr ?? "";
    if (r.categoria !== "COMMESSA") {
      commessa = `PROD${data.slice(2, 4)}`;
    } else if (!commessa) {
      const suf = suffissi.find(s => String(r.odp).endsWith(s));
      if (suf) commessa = String(r.odp).slice(0, -suf.length);
    }
    return {
      commessa,
      odp: r.odp,
      codiceArticolo: r.codice_articolo ?? "",
      matricola: r.matricola,
      operatore: `${r.cognome} ${r.nome}`.trim(),
      data,
      ore: Number(r.ore),
      tipo: r.operatore_tipo === "Esterno" ? "Esterno" : "Interno",
      azienda: r.azienda ?? "",
      reparto: r.reparto ?? "",
      categoria: r.categoria,
      rifacimento: !!r.rif,
    };
  });
}
