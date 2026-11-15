import { pool } from "./db";
import type { Role } from "./roles";
import { ALL_ROLES } from "./roles";

// Ricerca globale (home): una query leggera per categoria, risultati già pronti da mostrare.
// Aggiungere una categoria = aggiungere una voce a CATEGORIE (con i ruoli che possono vederla):
// la route API non cambia. Nessuna estensione Postgres (unaccent/pg_trgm non sono installate):
// accenti e maiuscole si eliminano con lower()+translate() sia sui campi sia sui termini.

export type TipoRisultato = "commessa" | "scheda" | "ritiro" | "carico";

export interface RisultatoRicerca {
  tipo: TipoRisultato;
  id: string;
  titolo: string;
  sottotitolo: string;
  href: string;
  badge: string;
  // Elemento ancora aperto: i completati vanno in fondo al proprio gruppo
  attivo: boolean;
}

const LIMITE_PER_CATEGORIA = 6;

const DA = "àáâäãèéêëìíîïòóôöõùúûüñç";
const A = "aaaaaeeeeiiiiooooouuuunc";

export function normalizza(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Espressione SQL che normalizza una colonna/concatenazione come normalizza() fa in JS
function fold(expr: string): string {
  return `translate(lower(${expr}), '${DA}', '${A}')`;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

interface Ricerca {
  full: string;
  termini: string[];
}

// Condizione "tutti i termini compaiono nel testo" + parametri; ritorna anche i placeholder per il ranking
function condizione(testoSql: string, r: Ricerca, primoParam: number): { where: string; values: string[]; nextParam: number } {
  const values: string[] = [];
  const parti = r.termini.map((t, i) => {
    values.push(`%${escapeLike(t)}%`);
    return `${fold(testoSql)} LIKE $${primoParam + i}`;
  });
  return { where: parti.join(" AND "), values, nextParam: primoParam + r.termini.length };
}

// 0 = codice identico alla ricerca, 1 = codice che inizia come la ricerca, 2 = altrove
function rankSql(codiceSql: string, paramEsatto: number, paramPrefisso: number): string {
  return `CASE WHEN ${fold(codiceSql)} = $${paramEsatto} THEN 0 WHEN ${fold(codiceSql)} LIKE $${paramPrefisso} THEN 1 ELSE 2 END`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Riga = any;

interface Categoria {
  tipo: TipoRisultato;
  ruoli: Role[];
  cerca: (r: Ricerca) => Promise<RisultatoRicerca[]>;
}

function join(...parti: (string | null | undefined)[]): string {
  return parti.map((p) => (p ?? "").trim()).filter(Boolean).join(" · ");
}

async function eseguiQuery(
  select: string,
  testoSql: string,
  codiceSql: string,
  extraWhere: string,
  ordineSql: string,
  r: Ricerca,
): Promise<Riga[]> {
  const c = condizione(testoSql, r, 1);
  const pEsatto = c.nextParam;
  const pPrefisso = c.nextParam + 1;
  const sql = `${select}
    WHERE ${extraWhere ? `${extraWhere} AND ` : ""}${c.where}
    ORDER BY ${rankSql(codiceSql, pEsatto, pPrefisso)}, ${ordineSql}
    LIMIT ${LIMITE_PER_CATEGORIA}`;
  const { rows } = await pool.query(sql, [...c.values, r.full, `${escapeLike(r.full)}%`]);
  return rows;
}

const CATEGORIE: Categoria[] = [
  {
    tipo: "commessa",
    ruoli: ALL_ROLES,
    cerca: async (r) => {
      const rows = await eseguiQuery(
        `SELECT c.id, c.numero_commessa, c.cliente, c.localita, c.responsabile, c.stato FROM commesse c`,
        `c.numero_commessa || ' ' || c.cliente || ' ' || c.localita || ' ' || c.info || ' ' || c.responsabile`,
        `c.numero_commessa`,
        "",
        `(c.stato = 'Chiusa'), c.numero_commessa DESC`,
        r,
      );
      return rows.map((x: Riga) => ({
        tipo: "commessa" as const,
        id: x.id,
        titolo: join(`Commessa ${x.numero_commessa}`, x.cliente),
        sottotitolo: join(x.localita, x.responsabile && `resp. ${x.responsabile}`),
        href: `/commesse/${x.id}`,
        badge: x.stato,
        attivo: x.stato !== "Chiusa",
      }));
    },
  },
  {
    tipo: "scheda",
    ruoli: ALL_ROLES,
    cerca: async (r) => {
      const rows = await eseguiQuery(
        `SELECT s.id, s.odp, s.numero_scheda, s.tipologia, s.stato, s.codice_articolo, s.descrizione_fasi, s.posizione,
                c.numero_commessa, c.cliente, COALESCE(f.nome, '') AS fornitore
           FROM schede s
           LEFT JOIN commesse c ON c.id = s.commessa_id
           LEFT JOIN fornitori f ON f.id = s.fornitore_id`,
        `s.odp || ' ' || s.numero_scheda || ' ' || s.codice_articolo || ' ' || s.descrizione_fasi || ' ' || s.posizione || ' ' ||
         COALESCE(c.numero_commessa, '') || ' ' || COALESCE(c.cliente, '') || ' ' || COALESCE(f.nome, '')`,
        `s.odp`,
        `s.archiviata = false`,
        `(s.stato IN ('Completato', 'Annullata')), s.odp DESC`,
        r,
      );
      return rows.map((x: Riga) => {
        const descr = String(x.descrizione_fasi ?? "").replace(/\s+/g, " ").trim();
        return {
          tipo: "scheda" as const,
          id: x.id,
          titolo: join(`ODP ${x.odp}`, x.codice_articolo, x.tipologia !== "Scheda" ? x.tipologia : ""),
          sottotitolo: join(
            x.numero_scheda && `Scheda ${x.numero_scheda}`,
            x.numero_commessa && `Commessa ${x.numero_commessa}`,
            x.cliente,
            x.fornitore,
            descr.length > 60 ? `${descr.slice(0, 60)}…` : descr,
          ),
          href: `/schede/${x.id}`,
          badge: x.stato,
          attivo: !["Completato", "Annullata"].includes(x.stato),
        };
      });
    },
  },
  {
    tipo: "ritiro",
    ruoli: ALL_ROLES,
    cerca: async (r) => {
      const rows = await eseguiQuery(
        `SELECT r.id, r.descrizione, r.tipo_movimento, r.stato, r.data_trasporto,
                s.odp, c.numero_commessa, COALESCE(f.nome, '') AS fornitore
           FROM ritiri r
           LEFT JOIN schede s ON s.id = r.scheda_id
           LEFT JOIN commesse c ON c.id = COALESCE(s.commessa_id, r.commessa_id)
           LEFT JOIN fornitori f ON f.id = r.fornitore_id`,
        `r.descrizione || ' ' || COALESCE(s.odp, '') || ' ' || COALESCE(c.numero_commessa, '') || ' ' || COALESCE(f.nome, '')`,
        `COALESCE(s.odp, '')`,
        `r.archiviato = false`,
        `(r.stato = 'Fatto'), r.data_trasporto DESC NULLS LAST`,
        r,
      );
      return rows.map((x: Riga) => ({
        tipo: "ritiro" as const,
        id: x.id,
        titolo: join(x.tipo_movimento || "Movimento", x.descrizione),
        sottotitolo: join(x.fornitore, x.odp && `ODP ${x.odp}`, x.numero_commessa && `Commessa ${x.numero_commessa}`),
        // La lista Ritiri parte filtrata sul testo; i Fatti stanno nell'archivio, che si apre da solo con arch=1
        href: `/ritiri?cerca=${encodeURIComponent(x.descrizione || x.odp || "")}${x.stato === "Fatto" ? "&arch=1" : ""}`,
        badge: x.stato,
        attivo: x.stato !== "Fatto",
      }));
    },
  },
  {
    tipo: "carico",
    ruoli: ALL_ROLES,
    cerca: async (r) => {
      const rows = await eseguiQuery(
        `SELECT k.id, k.titolo, k.stato, k.modalita, k.data_carico, k.commessa_id, c.numero_commessa, c.cliente
           FROM carichi k
           LEFT JOIN commesse c ON c.id = k.commessa_id`,
        `k.titolo || ' ' || k.descrizione || ' ' || COALESCE(c.numero_commessa, '') || ' ' || COALESCE(c.cliente, '')`,
        `k.titolo`,
        `k.archiviato = false`,
        `(k.stato = 'Spedito'), k.data_carico DESC NULLS LAST`,
        r,
      );
      return rows.map((x: Riga) => ({
        tipo: "carico" as const,
        id: x.id,
        titolo: x.titolo || "Carico",
        sottotitolo: join(
          x.numero_commessa && `Commessa ${x.numero_commessa}`,
          x.cliente,
          x.data_carico ? new Date(x.data_carico).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : "",
          x.modalita,
        ),
        // Il carico si apre nell'area di lavoro della sua commessa; senza commessa si filtra la panoramica sul titolo
        href: x.commessa_id ? `/carichi?commessa=${x.commessa_id}` : `/carichi?cerca=${encodeURIComponent(x.titolo || "")}`,
        badge: x.stato,
        attivo: x.stato !== "Spedito",
      }));
    },
  },
];

export const TIPI_ORDINE: TipoRisultato[] = CATEGORIE.map((c) => c.tipo);

export async function cercaGlobale(testo: string, ruolo: Role): Promise<RisultatoRicerca[]> {
  const full = normalizza(testo).replace(/\s+/g, " ").trim();
  const termini = full.split(" ").filter(Boolean).slice(0, 6);
  if (termini.length === 0) return [];
  const ricerca: Ricerca = { full, termini };
  const gruppi = await Promise.all(
    CATEGORIE.filter((c) => c.ruoli.includes(ruolo)).map((c) =>
      c.cerca(ricerca).catch((e) => {
        // Una categoria che fallisce non deve far sparire le altre
        console.error(`Ricerca globale: errore su ${c.tipo}`, e);
        return [] as RisultatoRicerca[];
      }),
    ),
  );
  return gruppi.flat();
}
