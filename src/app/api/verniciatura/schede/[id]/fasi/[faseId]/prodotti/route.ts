import { NextRequest, NextResponse } from "next/server";
import { addProdotto } from "@/lib/schedeVerniciaturaRepository";
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
    if (body.quantita !== undefined && body.quantita !== null && !(Number(body.quantita) > 0)) {
      return NextResponse.json({ error: "quantita deve essere maggiore di 0" }, { status: 400 });
    }

    const scheda = await addProdotto(id, faseId, {
      verniceId: body.verniceId,
      ruoloInFase: body.ruoloInFase,
      quantita: body.quantita != null ? Number(body.quantita) : null,
      unita: body.unita ?? null,
      note: body.note ?? null,
    });
    void logOperation(session.name, "UPDATE", "scheda_verniciatura", id, { azione: "aggiunta_prodotto", faseId, verniceId: body.verniceId, ruoloInFase: body.ruoloInFase });
    return NextResponse.json(scheda, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/verniciatura/schede/:id/fasi/:faseId/prodotti]", message);
    return NextResponse.json({ error: message }, { status: message.includes("immutabile") ? 409 : 500 });
  }
}
