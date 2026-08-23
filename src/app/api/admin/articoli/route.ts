import { NextRequest, NextResponse } from "next/server";
import { getArticoliConPattern, aggiornaPatternArticolo } from "@/lib/articoliRepository";
import { getSessionFromRequest, REPARTI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !REPARTI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    const articoli = await getArticoliConPattern();
    return NextResponse.json(articoli);
  } catch (e) {
    console.error("[admin/articoli GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !REPARTI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const codiceArticolo = typeof body.codiceArticolo === "string" ? body.codiceArticolo : "";
  if (!codiceArticolo) {
    return NextResponse.json({ error: "Articolo non valido" }, { status: 400 });
  }
  const patternId = typeof body.patternId === "string" && body.patternId ? body.patternId : null;

  try {
    const aggiornato = await aggiornaPatternArticolo(codiceArticolo, patternId);
    if (!aggiornato) return NextResponse.json({ error: "Articolo non trovato" }, { status: 404 });
    void logOperation(session.name, "UPDATE", "articolo", codiceArticolo, { azione: "assegna_pattern_articolo", patternId });
    return NextResponse.json(aggiornato);
  } catch (e) {
    console.error("[admin/articoli PATCH]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
