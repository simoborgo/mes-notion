import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export type Role = "admin" | "operatore" | "logistica" | "spedizioni" | "produzione" | "responsabile_produzione" | "magazziniere" | "magazziniere_vernici" | "ufficio_tecnico";

export const WRITE_ROLES: Role[] = ["admin", "logistica"];
// Solo la creazione di un nuovo Ritiro/Consegna — non modifica/eliminazione (restano
// WRITE_ROLES) né i Carichi, che condividono WRITE_ROLES ma non vanno estesi qui.
export const RITIRI_CREATE_ROLES: Role[] = ["admin", "logistica", "produzione"];
export const CARICO_ROLES: Role[] = ["admin", "produzione"];
export const SCARICO_MATERIALE_ROLES: Role[] = ["admin", "logistica"];
export const SPEDIZIONI_ROLES: Role[] = ["admin", "spedizioni"];
export const RILEVAMENTO_ORE_ROLES: Role[] = ["admin", "responsabile_produzione"];
export const FERRAMENTA_ROLES: Role[] = ["admin", "magazziniere", "produzione"];
// Kit Commessa: chi può creare/importare/confermare (Ufficio Tecnico incluso) — la spunta con
// scarico reale della giacenza resta esclusiva di FERRAMENTA_ROLES, mai di ufficio_tecnico.
// Assegnare questo ruolo a una persona richiede modificare USERS_JSON sulla VPS (nessuna UI admin).
export const KIT_COMMESSA_CREA_ROLES: Role[] = [...FERRAMENTA_ROLES, "ufficio_tecnico"];
export const VERNICIATURA_ROLES: Role[] = ["admin", "produzione"];
// Solo il magazzino Vernici (giacenza/carico/scarico/inventario) — separato da VERNICIATURA_ROLES
// perché l'addetto al magazzino non deve necessariamente poter operare su Cicli/Campionature.
// produzione incluso (deciso con l'utente 2026-08-14). Assegnare magazziniere_vernici a una
// persona richiede modificare USERS_JSON sulla VPS (nessuna UI admin).
export const MAGAZZINO_VERNICI_ROLES: Role[] = ["admin", "magazziniere_vernici", "produzione"];
export const MODIFICA_SCHEDA_ROLES: Role[] = ["admin", "produzione"];
export const RIENTRO_QUALITA_ROLES: Role[] = ["admin", "operatore", "logistica", "spedizioni", "produzione", "responsabile_produzione"];
// Chi, oltre a RITIRI_CREATE_ROLES, può organizzare il ritiro di una Rilavorazione già aperta dal
// pulsante "Inserisci un ritiro" di Rientro Qualità — operatore escluso (deciso con l'utente
// 2026-08-13): non può creare nessun Ritiro/Consegna, nemmeno per questa eccezione.
export const RITIRI_PICKUP_RILAVORAZIONE_ROLES: Role[] = RIENTRO_QUALITA_ROLES.filter(r => r !== "operatore");
// Nessun ruolo "commerciale" esiste oggi — solo admin per ora, facile da ampliare su richiesta.
export const OFFERTE_ROLES: Role[] = ["admin"];
export const PARAMETRI_REPARTO_ROLES: Role[] = ["admin"];
export const PREVISIONALE_ROLES: Role[] = ["admin"];
export const ORARI_TURNO_ROLES: Role[] = ["admin"];
export const IMPOSTAZIONI_ROLES: Role[] = ["admin"];
// Creazione/modifica di Commesse e Aree — stesso perimetro di CARICO_ROLES (deciso con l'utente
// 2026-08-13): Ufficio Tecnico non ha più questo permesso, solo admin e produzione.
export const COMMESSE_ROLES: Role[] = ["admin", "produzione"];

export interface Session {
  username: string;
  name: string;
  role: Role;
}

export const COOKIE_NAME = "mes_session";

function getSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.JWT_SECRET ?? "dev-fallback-secret-min-32-chars-!!!!"
  );
}

export async function signToken(payload: Session): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const { username, name, role } = payload as Record<string, unknown>;
    const ALL_ROLES: string[] = ["admin", "operatore", "logistica", "spedizioni", "produzione", "responsabile_produzione", "magazziniere", "magazziniere_vernici", "ufficio_tecnico"];
    if (
      typeof username !== "string" ||
      typeof name !== "string" ||
      !ALL_ROLES.includes(role as string)
    ) {
      return null;
    }
    return { username, name, role: role as Role };
  } catch {
    return null;
  }
}

/** Da usare nei route handler API (runtime Node.js) */
export async function getSessionFromRequest(req: NextRequest): Promise<Session | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** Da usare nei Server Components */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}
