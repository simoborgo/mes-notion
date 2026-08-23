import { NextRequest, NextResponse } from "next/server";
import { ricalcolaPiano } from "@/lib/apsSchedulerRepository";
import { getSessionFromRequest, REPARTI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Azione di sistema pesante (ricalcola l'intero piano APS, non una singola scheda) — perimetro
// admin, stesso delle altre pagine di anagrafica/sistema APS (Reparti, Articoli).
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !REPARTI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    const risultato = await ricalcolaPiano();
    void logOperation(session.name, "UPDATE", "reparto", "aps-ricalcolo", { azione: "ricalcola_piano_aps", ...risultato });
    return NextResponse.json(risultato);
  } catch (e) {
    console.error("[aps/ricalcola POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
