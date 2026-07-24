import { NextRequest, NextResponse } from "next/server";
import { getStoricoOdp } from "@/lib/oreRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const odp = new URL(req.url).searchParams.get("odp");
  if (!odp) return NextResponse.json({ error: "Parametro odp mancante" }, { status: 400 });
  try {
    const voci = await getStoricoOdp(odp);
    return NextResponse.json(voci);
  } catch (e) {
    console.error("[ore/storico-odp]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
