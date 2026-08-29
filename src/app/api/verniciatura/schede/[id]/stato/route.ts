import { NextRequest, NextResponse } from "next/server";
import { impostaStato } from "@/lib/schedeVerniciaturaRepository";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const STATI_VALIDI = ["bozza", "in_revisione", "approvato", "rifiutato"];

// Se stato='approvato', verifica strutturale (fasi senza vernice) + warning non bloccanti per
// TS/SDS mancanti, poi validato_at -> now(). Fonde l'ex POST cicli/:id/valida con l'ex POST
// campionature/:id/esito, ora sulla stessa riga (vedi schedeVerniciaturaRepository.impostaStato).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();

    if (!STATI_VALIDI.includes(body.stato)) {
      return NextResponse.json({ error: `stato non valido, ammessi: ${STATI_VALIDI.join(", ")}` }, { status: 400 });
    }

    const { scheda, warnings } = await impostaStato(id, body.stato);
    void logOperation(session.name, "UPDATE", "scheda_verniciatura", id, { azione: "imposta_stato", stato: body.stato, warnings: warnings.length });
    return NextResponse.json({ scheda, warnings });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/verniciatura/schede/:id/stato]", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
