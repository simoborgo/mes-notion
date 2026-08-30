import { NextRequest, NextResponse } from "next/server";
import { signToken, COOKIE_NAME } from "@/lib/auth";
import { validateCredentials } from "@/lib/users";

const MAX_TENTATIVI = 5;
const FINESTRA_MS = 60_000;
// In-memory: sufficiente per un processo Node persistente (deploy Docker su VPS, non serverless).
// Si azzera al riavvio del processo — stesso pattern/limite già in uso per il PIN operatore
// (ore/operatore/verifica-pin/route.ts), applicato qui allo username invece che alla matricola.
const tentativi = new Map<string, { count: number; resetAt: number }>();

function bloccato(username: string): boolean {
  const t = tentativi.get(username);
  if (!t) return false;
  if (Date.now() > t.resetAt) { tentativi.delete(username); return false; }
  return t.count >= MAX_TENTATIVI;
}

function registraTentativoFallito(username: string) {
  const t = tentativi.get(username);
  if (!t || Date.now() > t.resetAt) {
    tentativi.set(username, { count: 1, resetAt: Date.now() + FINESTRA_MS });
  } else {
    t.count += 1;
  }
}

export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }

  const { username, password } = body;

  if (!username || !password) {
    return NextResponse.json({ error: "Username e password obbligatori" }, { status: 400 });
  }

  if (bloccato(username)) {
    return NextResponse.json({ error: "Troppi tentativi, riprova tra un minuto" }, { status: 429 });
  }

  const session = await validateCredentials(username, password);
  if (!session) {
    registraTentativoFallito(username);
    return NextResponse.json({ error: "Credenziali errate" }, { status: 401 });
  }
  tentativi.delete(username);

  const token = await signToken(session);
  const res = NextResponse.json({ ok: true, name: session.name, role: session.role });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 giorni — stessa durata del JWT (src/lib/auth.ts)
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  return res;
}
