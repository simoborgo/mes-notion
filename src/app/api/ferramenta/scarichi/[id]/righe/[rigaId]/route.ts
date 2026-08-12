import { NextRequest, NextResponse } from "next/server";
import { rimuoviRigaScarico } from "@/lib/scaricoRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; rigaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id, rigaId } = await params;
  try {
    await rimuoviRigaScarico(rigaId);
    void logOperation(session.name, "DELETE", "scarico", id, { rigaId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[scarichi/[id]/righe/[rigaId] DELETE]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
