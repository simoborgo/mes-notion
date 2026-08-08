import { NextRequest, NextResponse } from "next/server";
import { getStandardRepartoMatrix } from "@/lib/standardRepartoRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    const righe = await getStandardRepartoMatrix();
    return NextResponse.json(righe);
  } catch (e) {
    console.error("[ore/standard-articoli]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
