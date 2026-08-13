import { NextRequest, NextResponse } from "next/server";
import { getCommesse, createCommessa } from "@/lib/commesseRepository";
import { getSessionFromRequest, COMMESSE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET() {
  try {
    const commesse = await getCommesse();
    return NextResponse.json(commesse);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero commesse" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !COMMESSE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const numeroCommessa = typeof body.numeroCommessa === "string" ? body.numeroCommessa.trim() : "";
  if (!numeroCommessa) {
    return NextResponse.json({ error: "Numero Commessa obbligatorio" }, { status: 400 });
  }

  try {
    const commessa = await createCommessa({
      numeroCommessa,
      cliente: typeof body.cliente === "string" ? body.cliente.trim() : "",
      localita: typeof body.localita === "string" ? body.localita.trim() : "",
      info: typeof body.info === "string" ? body.info.trim() : "",
      responsabile: typeof body.responsabile === "string" ? body.responsabile.trim() : "",
      stato: typeof body.stato === "string" ? body.stato : undefined,
      dataCarico: body.dataCarico || null,
      inizioMontaggio: body.inizioMontaggio || null,
      fineMontaggio: body.fineMontaggio || null,
    });
    void logOperation(session.name, "CREATE", "commessa", commessa.id, body as Record<string, unknown>);
    return NextResponse.json(commessa);
  } catch (e) {
    console.error("[commesse POST]", e);
    return NextResponse.json({ error: "Errore creazione commessa" }, { status: 500 });
  }
}
