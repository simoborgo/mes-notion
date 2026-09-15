import { NextRequest, NextResponse } from "next/server";
import { getTuttiOperatori } from "@/lib/operatoriRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

// Tutti gli operatori, compresi quelli non più in forza: questa lista alimenta lo Storico
// Operatore, dove si deve poter consultare anche chi non lavora più qui (vedi VistaStoricoOperatore.tsx).
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    const operatori = await getTuttiOperatori();
    return NextResponse.json(operatori);
  } catch (e) {
    console.error("[ore/operatori]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
