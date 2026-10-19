import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, MODIFICA_SCHEDA_ROLES } from "@/lib/auth";
import { getGiroById } from "@/lib/giriRepository";
import { removeFotoFromGiro } from "@/lib/giriFotoRepository";
import { logOperation } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; giroId: string; fotoId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MODIFICA_SCHEDA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { id, giroId, fotoId } = await params;
  try {
    const giro = await getGiroById(giroId).catch(() => null);
    if (!giro || giro.schedaId !== id) return NextResponse.json({ error: "Giro non trovato" }, { status: 404 });
    await removeFotoFromGiro(giroId, fotoId);
    void logOperation(session.name, "DELETE", "scheda_giro", giroId, { azione: "elimina_foto", fotoId });
    return NextResponse.json(await getGiroById(giroId));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
