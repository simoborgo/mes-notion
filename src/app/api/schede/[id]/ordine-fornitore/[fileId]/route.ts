import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { removeOrdineFornitoreFromScheda, getSchedaById } from "@/lib/schedeRepository";
import { getSessionFromRequest, MODIFICA_SCHEDA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MODIFICA_SCHEDA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { id, fileId } = await params;
  try {
    await removeOrdineFornitoreFromScheda(id, fileId);
    void logOperation(session.name, "UPDATE", "scheda", id, { azione: "elimina_ordine_fornitore", fileId });
    revalidatePath("/schede");
    const updated = await getSchedaById(id);
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
