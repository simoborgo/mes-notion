import { NextRequest, NextResponse } from "next/server";
import { addProdotto } from "@/lib/cicliVerniciaturaRepository";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const RUOLI_VALIDI = ["vernice", "catalizzatore", "diluente", "indurente", "additivo", "altro"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; faseId: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id, faseId } = await params;
    const body = await req.json();

    if (!body.verniceId) {
      return NextResponse.json({ error: "verniceId obbligatorio" }, { status: 400 });
    }
    if (!RUOLI_VALIDI.includes(body.ruoloInFase)) {
      return NextResponse.json({ error: `ruoloInFase non valido, ammessi: ${RUOLI_VALIDI.join(", ")}` }, { status: 400 });
    }
    if (body.percentuale !== undefined && body.percentuale !== null && !(Number(body.percentuale) > 0)) {
      return NextResponse.json({ error: "percentuale deve essere maggiore di 0" }, { status: 400 });
    }

    const ciclo = await addProdotto(id, faseId, {
      verniceId: body.verniceId,
      ruoloInFase: body.ruoloInFase,
      percentuale: body.percentuale != null ? Number(body.percentuale) : null,
      note: body.note ?? null,
    });
    void logOperation(session.name, "UPDATE", "ciclo_verniciatura", id, { azione: "aggiunta_prodotto", faseId, verniceId: body.verniceId, ruoloInFase: body.ruoloInFase });
    return NextResponse.json(ciclo, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/verniciatura/cicli/:id/fasi/:faseId/prodotti]", message);
    return NextResponse.json({ error: message }, { status: message.includes("immutabile") ? 409 : 500 });
  }
}
