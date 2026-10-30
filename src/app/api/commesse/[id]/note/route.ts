import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createNota } from "@/lib/commessaStoricoRepository";
import { getSessionFromRequest, COMMESSA_CONTENUTO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !COMMESSA_CONTENUTO_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();
    const testo = typeof body.testo === "string" ? body.testo.trim() : "";
    if (!testo) return NextResponse.json({ error: "Scrivi il testo della nota" }, { status: 400 });
    const nota = await createNota({ commessaId: id, testo, creatoDa: session.name });
    void logOperation(session.name, "CREATE", "commessa_nota", nota.id, { commessaId: id });
    revalidatePath(`/commesse/${id}`);
    return NextResponse.json(nota, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore creazione nota" }, { status: 500 });
  }
}
