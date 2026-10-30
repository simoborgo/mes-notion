import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getNotaById, deleteNota } from "@/lib/commessaStoricoRepository";
import { getSessionFromRequest, COMMESSA_CONTENUTO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; notaId: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !COMMESSA_CONTENUTO_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id, notaId } = await params;
    const n = await getNotaById(notaId);
    if (!n || n.commessaId !== id) return NextResponse.json({ error: "Nota non trovata" }, { status: 404 });
    await deleteNota(notaId);
    void logOperation(session.name, "DELETE", "commessa_nota", notaId, { commessaId: id });
    revalidatePath(`/commesse/${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore eliminazione nota" }, { status: 500 });
  }
}
