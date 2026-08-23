import { NextRequest, NextResponse } from "next/server";
import { getPatternCiclo, creaPattern } from "@/lib/patternCicloRepository";
import { getSessionFromRequest, REPARTI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !REPARTI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    const pattern = await getPatternCiclo();
    return NextResponse.json(pattern);
  } catch (e) {
    console.error("[admin/pattern-ciclo GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !REPARTI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!nome) {
    return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
  }
  try {
    const pattern = await creaPattern(nome);
    void logOperation(session.name, "CREATE", "pattern_ciclo", pattern.id, { nome });
    return NextResponse.json(pattern);
  } catch (e) {
    console.error("[admin/pattern-ciclo POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
