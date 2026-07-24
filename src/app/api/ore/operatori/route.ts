import { NextRequest, NextResponse } from "next/server";
import { getOperatori } from "@/lib/notion";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    const operatori = await getOperatori();
    return NextResponse.json(operatori);
  } catch (e) {
    console.error("[ore/operatori]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
