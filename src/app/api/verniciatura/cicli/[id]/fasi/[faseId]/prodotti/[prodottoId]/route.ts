import { NextRequest, NextResponse } from "next/server";
import { deleteProdotto } from "@/lib/cicliVerniciaturaRepository";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; faseId: string; prodottoId: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id, faseId, prodottoId } = await params;

    const ciclo = await deleteProdotto(id, faseId, prodottoId);
    void logOperation(session.name, "DELETE", "ciclo_verniciatura", id, { azione: "rimozione_prodotto", faseId, prodottoId });
    return NextResponse.json(ciclo);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/verniciatura/cicli/:id/fasi/:faseId/prodotti/:prodottoId]", message);
    return NextResponse.json({ error: message }, { status: message.includes("immutabile") ? 409 : 500 });
  }
}
