import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { cercaGlobale } from "@/lib/ricercaRepository";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Sessione scaduta: effettua di nuovo il login" }, { status: 403 });
  }
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  if (q.trim().length < 2) return NextResponse.json({ risultati: [] });
  try {
    const risultati = await cercaGlobale(q, session.role);
    return NextResponse.json({ risultati });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nella ricerca" }, { status: 500 });
  }
}
