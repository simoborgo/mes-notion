import { NextRequest, NextResponse } from "next/server";
import { creaFasePattern } from "@/lib/patternCicloRepository";
import { getSessionFromRequest, REPARTI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !REPARTI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const repartoId = typeof body.repartoId === "string" ? body.repartoId : "";
  const ordine = Number(body.ordine);
  if (!repartoId || !Number.isFinite(ordine)) {
    return NextResponse.json({ error: "Reparto o ordine non validi" }, { status: 400 });
  }
  const condizionale = Boolean(body.condizionale);
  const condizione = condizionale && typeof body.condizione === "string" && body.condizione ? body.condizione : null;
  const tempoAttrezzaggioOre = body.tempoAttrezzaggioOre != null && body.tempoAttrezzaggioOre !== "" ? Number(body.tempoAttrezzaggioOre) : null;

  try {
    const { id } = await params;
    const fase = await creaFasePattern(id, {
      repartoId, ordine,
      sottoFase: body.sottoFase || null,
      condizionale, condizione,
      parallellizzabile: Boolean(body.parallellizzabile),
      tempoAttrezzaggioOre,
    });
    void logOperation(session.name, "CREATE", "pattern_ciclo", id, { azione: "aggiungi_fase", repartoId, ordine });
    return NextResponse.json(fase);
  } catch (e) {
    console.error("[admin/pattern-ciclo/[id]/fasi POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
