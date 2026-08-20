import { Pool } from "pg";

// Connessione all'app "Gestione Permessi" (Prisma/Postgres separato, stesso VPS).
// Raggiungibile SOLO dalla rete Docker interna della VPS — in locale/sviluppo
// questa connessione fallirà: i chiamanti devono gestire l'errore esplicitamente.
// Timeout breve e esplicito: se la rete Docker interna non è raggiungibile
// (es. sviluppo locale), fallire in pochi secondi invece di restare appesi.
const permessiPool = process.env.PERMESSI_DATABASE_URL
  ? new Pool({ connectionString: process.env.PERMESSI_DATABASE_URL, ssl: false, connectionTimeoutMillis: 5000 })
  : null;

export interface AssenzaApprovata {
  cognome: string;
  nome: string;
  tipo: "PERMESSO" | "FERIE";
  dataInizio: string;
  dataFine: string;
  oraInizio: string | null;
  oraFine: string | null;
}

// Tutte le richieste APPROVATA il cui intervallo copre la data indicata.
// Lancia se la connessione non è configurata o non raggiungibile — nessun
// fallback silenzioso: meglio un errore visibile che considerare "nessuno assente".
export async function getAssenzeApprovatePerData(data: string): Promise<AssenzaApprovata[]> {
  if (!permessiPool) throw new Error("PERMESSI_DATABASE_URL non configurato");
  const { rows } = await permessiPool.query(
    `SELECT u.cognome, u.nome, r.tipo, r."dataInizio", r."dataFine", r."oraInizio", r."oraFine"
     FROM "Richiesta" r
     JOIN "User" u ON u.id = r."userId"
     WHERE r.stato = 'APPROVATA'
       AND r."dataInizio"::date <= $1::date
       AND r."dataFine"::date >= $1::date`,
    [data]
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    cognome: r.cognome,
    nome: r.nome,
    tipo: r.tipo,
    dataInizio: r.dataInizio,
    dataFine: r.dataFine,
    oraInizio: r.oraInizio,
    oraFine: r.oraFine,
  }));
}

// Bug reale scoperto in sessione (2026-08-20): "D'Amico"/"D'Ingeo" salvati con apostrofo
// tipografico (’ U+2019) in operatori (questa app) ma dritto (' U+0027) in Gestione Permessi —
// il confronto falliva sempre, silenziosamente, per QUALUNQUE giorno di ferie/permesso di quelle
// persone, non solo l'ultimo giorno del range come sembrava dal sintomo osservato. Le varianti di
// apostrofo/virgoletta singola vanno tutte ricondotte alla stessa (') prima del confronto.
function normalizzaNome(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’ʼ‘`´]/g, "'");
}

// Punto di match isolato: oggi Cognome+Nome (case/accent-insensitive) è l'unico
// campo ragionevolmente popolato su entrambi i sistemi. Se in futuro email o PIN
// Permessi vengono compilati in modo affidabile su Notion, sostituire qui.
export function isAssente(cognome: string, nome: string, assenze: AssenzaApprovata[]): AssenzaApprovata | null {
  const c = normalizzaNome(cognome);
  const n = normalizzaNome(nome);
  return assenze.find(a => normalizzaNome(a.cognome) === c && normalizzaNome(a.nome) === n) ?? null;
}
