import { NextRequest, NextResponse } from "next/server";
import { eliminaSegmentoAnomalo } from "@/lib/segmentiOperatoreRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const ok = await eliminaSegmentoAnomalo(id);
    if (!ok) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    void logOperation(session.name, "DELETE", "segmento_operatore", id, { azione: "rimuovi-segmento-anomalo" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[ore/segmenti-anomali/[id] DELETE]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
