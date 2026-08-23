import { NextRequest, NextResponse } from "next/server";
import { getPatternCicloAttivi } from "@/lib/patternCicloRepository";
import { getSessionFromRequest, MODIFICA_SCHEDA_ROLES } from "@/lib/auth";

// Elenco Pattern_Ciclo (sola lettura) — usato dal selettore inline in DettaglioSchedaModal
// quando il pattern di un articolo non si risolve da solo.
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !MODIFICA_SCHEDA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  try {
    const pattern = await getPatternCicloAttivi();
    return NextResponse.json(pattern);
  } catch (e) {
    console.error("[pattern-ciclo GET]", e);
    return NextResponse.json({ error: "Errore nel recupero pattern" }, { status: 500 });
  }
}
