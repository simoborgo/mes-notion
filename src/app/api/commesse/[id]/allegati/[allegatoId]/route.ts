import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAllegatoById, deleteAllegato } from "@/lib/commessaAllegatiRepository";
import { getSessionFromRequest, COMMESSA_CONTENUTO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; allegatoId: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !COMMESSA_CONTENUTO_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id, allegatoId } = await params;
    const a = await getAllegatoById(allegatoId);
    if (!a || a.commessaId !== id) return NextResponse.json({ error: "Documento non trovato" }, { status: 404 });
    await deleteAllegato(allegatoId);
    void logOperation(session.name, "DELETE", "commessa_allegato", allegatoId, { commessaId: id, filename: a.nomeFile });
    revalidatePath(`/commesse/${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore eliminazione documento" }, { status: 500 });
  }
}
