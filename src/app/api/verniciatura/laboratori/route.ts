import { NextRequest, NextResponse } from "next/server";
import { getLaboratori, createLaboratorio } from "@/lib/laboratoriRepository";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const soloAttivi = req.nextUrl.searchParams.get("includeInattivi") !== "true";
    const laboratori = await getLaboratori(soloAttivi);
    return NextResponse.json(laboratori);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero laboratori/fornitori" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const body = await req.json();
    const nome = typeof body.nome === "string" ? body.nome.trim() : "";
    if (!nome) {
      return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
    }

    const laboratorio = await createLaboratorio({ nome, note: body.note ?? null });
    void logOperation(session.name, "CREATE", "laboratorio_verniciatura", laboratorio.id, { nome });
    return NextResponse.json(laboratorio, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore creazione laboratorio/fornitore" }, { status: 500 });
  }
}
