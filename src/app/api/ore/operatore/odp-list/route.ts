import { NextRequest, NextResponse } from "next/server";
import { getOdpAttivi } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";

// Qualunque sessione valida — v1 mostra tutti gli ODP attivi, nessun filtro per reparto/fase
// (vedi piano: "Fase Corrente" troppo poco popolata oggi per un filtro affidabile).
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  try {
    const odp = await getOdpAttivi();
    return NextResponse.json(odp);
  } catch (e) {
    console.error("[ore/operatore/odp-list]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
