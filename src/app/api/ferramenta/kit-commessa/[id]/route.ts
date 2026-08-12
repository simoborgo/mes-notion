import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { eliminaKitCommessaVuoto, getKitCommessaById, getRigheByKit } from "@/lib/kitCommessaRepository";
import { getSessionFromRequest, KIT_COMMESSA_CREA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !KIT_COMMESSA_CREA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const kit = await getKitCommessaById(id);
    if (!kit) return NextResponse.json({ error: "Kit Commessa non trovato" }, { status: 404 });
    const righe = await getRigheByKit(id);
    return NextResponse.json({ kit, righe });
  } catch (e) {
    console.error("[kit-commessa/[id] GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// "Annulla" in fase di preparazione — elimina solo bozze vuote e non ancora confermate
// (controllo ripetuto anche server-side in eliminaKitCommessaVuoto, non ci si fida del solo client).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !KIT_COMMESSA_CREA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  try {
    await eliminaKitCommessaVuoto(id);
    void logOperation(session.name, "DELETE", "kit_commessa", id, { azione: "annulla-bozza" });
    revalidatePath("/ferramenta/kit-commessa");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[kit-commessa/[id] DELETE]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
