import { NextRequest, NextResponse } from "next/server";
import { generaFiglio } from "@/lib/schedeVerniciaturaRepository";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;

    const figlio = await generaFiglio(id);
    void logOperation(session.name, "CREATE", "scheda_verniciatura", figlio.id, { azione: "genera_figlio", schedaPadreId: id });
    return NextResponse.json(figlio, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/verniciatura/schede/:id/genera-figlio]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
