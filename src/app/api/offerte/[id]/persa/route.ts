import { NextRequest, NextResponse } from "next/server";
import { segnaOffertaPersa } from "@/lib/offerteRepository";
import { getSessionFromRequest, OFFERTE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !OFFERTE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const offerta = await segnaOffertaPersa(id);
    if (!offerta) return NextResponse.json({ error: "Offerta non trovata o non più in stato 'Offerta'" }, { status: 400 });
    void logOperation(session.name, "UPDATE", "offerta", id, { azione: "persa" });
    return NextResponse.json(offerta);
  } catch (e) {
    console.error("[offerte/[id]/persa POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
