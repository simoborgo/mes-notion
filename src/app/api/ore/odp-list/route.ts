import { NextRequest, NextResponse } from "next/server";
import { getOdpAttivi } from "@/lib/notion";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    const odp = await getOdpAttivi();
    return NextResponse.json(odp);
  } catch (e) {
    console.error("[ore/odp-list]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
