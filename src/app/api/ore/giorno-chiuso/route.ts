import { NextRequest, NextResponse } from "next/server";
import { setGiornoChiuso } from "@/lib/giorniChiusiRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { data, chiuso } = body;
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data) || typeof chiuso !== "boolean") {
    return NextResponse.json({ error: "data (YYYY-MM-DD) e chiuso (boolean) sono obbligatori" }, { status: 400 });
  }

  try {
    await setGiornoChiuso(data, chiuso);
    void logOperation(session.name, "UPDATE", "ore_giorno_chiuso", data, { chiuso });
    return NextResponse.json({ data, chiuso });
  } catch (e) {
    console.error("[ore/giorno-chiuso POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
