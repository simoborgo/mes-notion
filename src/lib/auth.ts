import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export type Role = "admin" | "operatore" | "logistica" | "spedizioni" | "produzione" | "responsabile_produzione" | "magazziniere";

export const WRITE_ROLES: Role[] = ["admin", "logistica"];
// Solo la creazione di un nuovo Ritiro/Consegna — non modifica/eliminazione (restano
// WRITE_ROLES) né i Carichi, che condividono WRITE_ROLES ma non vanno estesi qui.
export const RITIRI_CREATE_ROLES: Role[] = ["admin", "logistica", "produzione"];
export const CARICO_ROLES: Role[] = ["admin", "produzione"];
export const SCARICO_MATERIALE_ROLES: Role[] = ["admin", "logistica"];
export const SPEDIZIONI_ROLES: Role[] = ["admin", "spedizioni"];
export const RILEVAMENTO_ORE_ROLES: Role[] = ["admin", "responsabile_produzione"];
export const FERRAMENTA_ROLES: Role[] = ["admin", "magazziniere", "produzione"];
export const MODIFICA_SCHEDA_ROLES: Role[] = ["admin", "produzione"];
export const RIENTRO_QUALITA_ROLES: Role[] = ["admin", "operatore", "logistica", "spedizioni", "produzione", "responsabile_produzione"];
// Nessun ruolo "commerciale" esiste oggi — solo admin per ora, facile da ampliare su richiesta.
export const OFFERTE_ROLES: Role[] = ["admin"];
export const PARAMETRI_REPARTO_ROLES: Role[] = ["admin"];
export const PREVISIONALE_ROLES: Role[] = ["admin"];

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
    const ALL_ROLES: string[] = ["admin", "operatore", "logistica", "spedizioni", "produzione", "responsabile_produzione", "magazziniere"];
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
