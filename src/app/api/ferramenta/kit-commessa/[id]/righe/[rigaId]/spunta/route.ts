import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { spuntaRiga } from "@/lib/kitCommessaRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Solo chi ha accesso Ferramenta pieno può spuntare (= eventuale scarico reale) — mai
// ufficio_tecnico, che può solo preparare/confermare la lista.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; rigaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id, rigaId } = await params;
  const body = await req.json().catch(() => ({}));
  const articoloId = typeof body.articoloId === "string" && body.articoloId ? body.articoloId : null;
  try {
    const { riga, warnings } = await spuntaRiga(rigaId, { articoloId, operatore: session.name });
    void logOperation(session.name, "UPDATE", "kit_commessa", id, { rigaId, articoloId, azione: "spunta" });
    revalidatePath(`/ferramenta/kit-commessa/${id}`);
    if (warnings.length > 0) return NextResponse.json({ ok: true, riga, warnings }, { status: 207 });
    return NextResponse.json({ ok: true, riga });
  } catch (e) {
    console.error("[kit-commessa/[id]/righe/[rigaId]/spunta POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
