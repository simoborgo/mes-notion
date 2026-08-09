import { NextRequest, NextResponse } from "next/server";
import { updateFase, deleteFase } from "@/lib/cicliVerniciaturaRepository";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; faseId: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id, faseId } = await params;
    const body = await req.json();

    const ciclo = await updateFase(id, faseId, { ordine: body.ordine, nomeFase: body.nomeFase, note: body.note });
    void logOperation(session.name, "UPDATE", "ciclo_verniciatura", id, { azione: "modifica_fase", faseId });
    return NextResponse.json(ciclo);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[PATCH /api/verniciatura/cicli/:id/fasi/:faseId]", message);
    return NextResponse.json({ error: message }, { status: message.includes("immutabile") ? 409 : 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; faseId: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id, faseId } = await params;

    const ciclo = await deleteFase(id, faseId);
    void logOperation(session.name, "DELETE", "ciclo_verniciatura", id, { azione: "rimozione_fase", faseId });
    return NextResponse.json(ciclo);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/verniciatura/cicli/:id/fasi/:faseId]", message);
    return NextResponse.json({ error: message }, { status: message.includes("immutabile") ? 409 : 500 });
  }
}
