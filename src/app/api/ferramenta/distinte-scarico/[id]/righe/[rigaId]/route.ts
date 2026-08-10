import { NextRequest, NextResponse } from "next/server";
import { rimuoviRigaDistinta } from "@/lib/distinteScaricoRepository";
import { getSessionFromRequest, DISTINTE_SCARICO_CREA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; rigaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !DISTINTE_SCARICO_CREA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id, rigaId } = await params;
  try {
    await rimuoviRigaDistinta(rigaId);
    void logOperation(session.name, "DELETE", "distinta_scarico", id, { rigaId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[distinte-scarico/[id]/righe/[rigaId] DELETE]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
