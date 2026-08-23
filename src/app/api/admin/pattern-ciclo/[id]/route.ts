import { NextRequest, NextResponse } from "next/server";
import { getPatternCicloById, aggiornaPattern, getFasiPattern } from "@/lib/patternCicloRepository";
import { getSessionFromRequest, REPARTI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !REPARTI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const [pattern, fasi] = await Promise.all([getPatternCicloById(id), getFasiPattern(id)]);
    if (!pattern) return NextResponse.json({ error: "Pattern non trovato" }, { status: 404 });
    return NextResponse.json({ pattern, fasi });
  } catch (e) {
    console.error("[admin/pattern-ciclo/[id] GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !REPARTI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!nome) {
    return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
  }
  const attivo = Boolean(body.attivo);

  try {
    const { id } = await params;
    const aggiornato = await aggiornaPattern(id, { nome, attivo });
    if (!aggiornato) return NextResponse.json({ error: "Pattern non trovato" }, { status: 404 });
    void logOperation(session.name, "UPDATE", "pattern_ciclo", id, { nome, attivo });
    return NextResponse.json(aggiornato);
  } catch (e) {
    console.error("[admin/pattern-ciclo/[id] PATCH]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
