import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createScadenza, schedaDellaCommessa } from "@/lib/commessaScadenzeRepository";
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
    const titolo = typeof body.titolo === "string" ? body.titolo.trim() : "";
    if (!titolo) return NextResponse.json({ error: "Titolo obbligatorio" }, { status: 400 });
    if (typeof body.scadenza !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.scadenza)) return NextResponse.json({ error: "Data di scadenza non valida" }, { status: 400 });
    const schedaId = typeof body.schedaId === "string" && body.schedaId ? body.schedaId : null;
    if (schedaId && !(await schedaDellaCommessa(schedaId, id))) return NextResponse.json({ error: "L'ODP non appartiene a questa commessa" }, { status: 400 });

    const s = await createScadenza({ commessaId: id, schedaId, titolo, scadenza: body.scadenza, creatoDa: session.name });
    void logOperation(session.name, "CREATE", "commessa_scadenza", s.id, { commessaId: id, titolo, scadenza: s.scadenza, odp: s.odp });
    revalidatePath(`/commesse/${id}`);
    return NextResponse.json(s, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore creazione scadenza" }, { status: 500 });
  }
}
