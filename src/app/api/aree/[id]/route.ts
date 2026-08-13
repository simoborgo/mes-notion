import { NextRequest, NextResponse } from "next/server";
import { updateArea } from "@/lib/areeRepository";
import { getSessionFromRequest, COMMESSE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !COMMESSE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const area = await updateArea(id, {
      nomeArredo: typeof body.nomeArredo === "string" ? body.nomeArredo.trim() : undefined,
      codiceArticoloA: typeof body.codiceArticoloA === "string" ? body.codiceArticoloA.trim() : undefined,
      dataConsegnaPrevista: body.dataConsegnaPrevista !== undefined ? (body.dataConsegnaPrevista || null) : undefined,
      descrizione: typeof body.descrizione === "string" ? body.descrizione.trim() : undefined,
      note: typeof body.note === "string" ? body.note.trim() : undefined,
      posizione: typeof body.posizione === "string" ? body.posizione.trim() : undefined,
      quantita: typeof body.quantita === "number" ? body.quantita : undefined,
      statoProduzione: typeof body.statoProduzione === "string" ? body.statoProduzione.trim() : undefined,
    });
    void logOperation(session.name, "UPDATE", "area", id, body as Record<string, unknown>);
    return NextResponse.json(area);
  } catch (e) {
    console.error("[aree/[id] PATCH]", e);
    return NextResponse.json({ error: "Errore aggiornamento area" }, { status: 500 });
  }
}
