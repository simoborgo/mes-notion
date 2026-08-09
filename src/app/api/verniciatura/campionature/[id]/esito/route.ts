import { NextRequest, NextResponse } from "next/server";
import { impostaEsito } from "@/lib/campionatureVerniciaturaRepository";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const ESITI_VALIDI = ["approvato", "rifiutato", "in_revisione"];

// Se esito='approvato', nella stessa transazione valida anche il ciclo collegato (warning non
// bloccanti per TS/SDS mancanti, poi stato ciclo -> validato) — decisione esplicita dell'utente.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();

    if (!ESITI_VALIDI.includes(body.esito)) {
      return NextResponse.json({ error: `esito non valido, ammessi: ${ESITI_VALIDI.join(", ")}` }, { status: 400 });
    }

    const { campionatura, warningsCiclo } = await impostaEsito(id, body.esito);
    void logOperation(session.name, "UPDATE", "campionatura_verniciatura", id, { azione: "imposta_esito", esito: body.esito });
    return NextResponse.json({ campionatura, warningsCiclo });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/verniciatura/campionature/:id/esito]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
