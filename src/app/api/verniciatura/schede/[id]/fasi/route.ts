import { NextRequest, NextResponse } from "next/server";
import { addFase } from "@/lib/schedeVerniciaturaRepository";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();
    if (typeof body.ordine !== "number") {
      return NextResponse.json({ error: "Ordine numerico obbligatorio" }, { status: 400 });
    }

    const scheda = await addFase(id, { ordine: body.ordine, nomeFase: body.nomeFase ?? null, note: body.note ?? null });
    void logOperation(session.name, "UPDATE", "scheda_verniciatura", id, { azione: "aggiunta_fase", ordine: body.ordine });
    return NextResponse.json(scheda, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/verniciatura/schede/:id/fasi]", message);
    return NextResponse.json({ error: message }, { status: message.includes("immutabile") ? 409 : 500 });
  }
}
