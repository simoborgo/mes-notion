import { NextRequest, NextResponse } from "next/server";
import { getStoricoParametriReparto } from "@/lib/parametriRepartoRepository";
import { getSessionFromRequest, PARAMETRI_REPARTO_ROLES } from "@/lib/auth";
import { REPARTI_PRODUZIONE } from "@/lib/types";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !PARAMETRI_REPARTO_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const reparto = req.nextUrl.searchParams.get("reparto") ?? "";
  if (!REPARTI_PRODUZIONE.includes(reparto)) {
    return NextResponse.json({ error: "Reparto non valido" }, { status: 400 });
  }
  try {
    const storico = await getStoricoParametriReparto(reparto);
    return NextResponse.json(storico);
  } catch (e) {
    console.error("[admin/parametri-reparto/storico GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
