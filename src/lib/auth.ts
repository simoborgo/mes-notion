import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { ALL_ROLES, type Role } from "./roles";

// Le costanti di ruolo vivono in ./roles (modulo client-safe, nessun import di next/headers) —
// qui vengono ri-esportate per non rompere i call site server-side esistenti che importano da
// "@/lib/auth". Unica fonte di verità: src/lib/roles.ts.
export * from "./roles";

export interface Session {
  username: string;
  name: string;
  role: Role;
}

export const COOKIE_NAME = "mes_session";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET non configurata: impostare la variabile d'ambiente prima dell'avvio");
  }
  return new TextEncoder().encode(secret);
}

// Durata ridotta da 30 a 7 giorni (deciso con l'utente 2026-08-30): limita la finestra di rischio
// se un account viene disattivato o gli si cambia ruolo in USERS_JSON — non c'è revoca immediata
// delle sessioni già emesse, solo scadenza naturale.
const SESSION_TOKEN_TTL = "7d";

export async function signToken(payload: Session): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TOKEN_TTL)
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const { username, name, role } = payload as Record<string, unknown>;
    if (
      typeof username !== "string" ||
      typeof name !== "string" ||
      !ALL_ROLES.includes(role as Role)
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

// Token separato emesso da /api/ore/operatore/verifica-pin dopo un PIN corretto: lega la
// matricola verificata alle chiamate successive (segmento/fine-giornata/stato) così quelle route
// non devono più fidarsi della matricola passata dal client. Durata pensata per coprire un turno
// con straordinario (deciso con l'utente 2026-08-30): più lunga di così amplierebbe la finestra di
// rischio se un operatore dimentica di premere "Cambia operatore" a fine turno sul tablet condiviso.
const OPERATORE_TOKEN_TTL = "10h";

export async function signOperatoreToken(matricola: string): Promise<string> {
  return new SignJWT({ matricola, typ: "operatore" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(OPERATORE_TOKEN_TTL)
    .sign(getSecret());
}

/** Ritorna la matricola verificata dal token, o null se assente/scaduto/non valido. */
export async function verifyOperatoreToken(token: string | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const { matricola, typ } = payload as Record<string, unknown>;
    if (typ !== "operatore" || typeof matricola !== "string") return null;
    return matricola;
  } catch {
    return null;
  }
}

/** Estrae e verifica il token operatore dall'header Authorization: Bearer <token>. */
export async function getOperatoreMatricolaFromRequest(req: NextRequest): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  return verifyOperatoreToken(token);
}

/** Da usare nei Server Components */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}
