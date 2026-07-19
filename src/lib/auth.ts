import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export type Role = "admin" | "operatore" | "logistica" | "spedizioni" | "produzione";

export const WRITE_ROLES: Role[] = ["admin", "operatore", "logistica"];

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
    const ALL_ROLES: string[] = ["admin", "operatore", "logistica", "spedizioni", "produzione"];
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
