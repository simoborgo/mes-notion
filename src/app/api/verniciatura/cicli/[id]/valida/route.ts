import { NextRequest, NextResponse } from "next/server";
import { valida } from "@/lib/cicliVerniciaturaRepository";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;

    const { ciclo, warnings } = await valida(id);
    void logOperation(session.name, "UPDATE", "ciclo_verniciatura", id, { azione: "valida", warnings: warnings.length });
    return NextResponse.json({ ciclo, warnings });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/verniciatura/cicli/:id/valida]", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
