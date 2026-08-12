import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { rimuoviRigaKit } from "@/lib/kitCommessaRepository";
import { getSessionFromRequest, KIT_COMMESSA_CREA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; rigaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !KIT_COMMESSA_CREA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id, rigaId } = await params;
  try {
    await rimuoviRigaKit(rigaId);
    void logOperation(session.name, "DELETE", "kit_commessa", id, { rigaId });
    revalidatePath(`/ferramenta/kit-commessa/${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[kit-commessa/[id]/righe/[rigaId] DELETE]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
