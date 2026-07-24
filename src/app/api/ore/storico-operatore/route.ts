import { NextRequest, NextResponse } from "next/server";
import { getStoricoOperatore } from "@/lib/oreRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const matricola = searchParams.get("matricola");
  if (!matricola) return NextResponse.json({ error: "Parametro matricola mancante" }, { status: 400 });
  const da = searchParams.get("da") ?? undefined;
  const a = searchParams.get("a") ?? undefined;
  try {
    const voci = await getStoricoOperatore(matricola, da, a);
    return NextResponse.json(voci);
  } catch (e) {
    console.error("[ore/storico-operatore]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
