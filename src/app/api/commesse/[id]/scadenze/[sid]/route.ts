import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getScadenzaById, updateScadenza, deleteScadenza, schedaDellaCommessa } from "@/lib/commessaScadenzeRepository";
import { getSessionFromRequest, COMMESSA_CONTENUTO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; sid: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !COMMESSA_CONTENUTO_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id, sid } = await params;
    const attuale = await getScadenzaById(sid);
    if (!attuale || attuale.commessaId !== id) return NextResponse.json({ error: "Scadenza non trovata" }, { status: 404 });
    const body = await req.json();
    if (body.stato !== undefined && body.stato !== "aperta" && body.stato !== "fatta") return NextResponse.json({ error: "Stato non valido" }, { status: 400 });
    if (body.titolo !== undefined && !String(body.titolo).trim()) return NextResponse.json({ error: "Titolo obbligatorio" }, { status: 400 });
    if (body.scadenza !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.scadenza))) return NextResponse.json({ error: "Data di scadenza non valida" }, { status: 400 });
    let schedaId: string | null | undefined;
    if (body.schedaId !== undefined) {
      schedaId = body.schedaId || null;
      if (schedaId && !(await schedaDellaCommessa(schedaId, id))) return NextResponse.json({ error: "L'ODP non appartiene a questa commessa" }, { status: 400 });
    }
    const s = await updateScadenza(sid, {
      titolo: body.titolo !== undefined ? String(body.titolo).trim() : undefined,
      scadenza: body.scadenza, schedaId, stato: body.stato,
    });
    void logOperation(session.name, "UPDATE", "commessa_scadenza", sid, { commessaId: id, titolo: s.titolo, scadenza: s.scadenza, stato: s.stato, odp: s.odp });
    revalidatePath(`/commesse/${id}`);
    return NextResponse.json(s);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore aggiornamento scadenza" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !COMMESSA_CONTENUTO_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id, sid } = await params;
    const attuale = await getScadenzaById(sid);
    if (!attuale || attuale.commessaId !== id) return NextResponse.json({ error: "Scadenza non trovata" }, { status: 404 });
    await deleteScadenza(sid);
    void logOperation(session.name, "DELETE", "commessa_scadenza", sid, { commessaId: id, titolo: attuale.titolo });
    revalidatePath(`/commesse/${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore eliminazione scadenza" }, { status: 500 });
  }
}
