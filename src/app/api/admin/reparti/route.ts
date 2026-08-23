import { NextRequest, NextResponse } from "next/server";
import { getReparti, aggiornaReparto } from "@/lib/repartiRepository";
import { getSessionFromRequest, REPARTI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !REPARTI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    const reparti = await getReparti();
    return NextResponse.json(reparti);
  } catch (e) {
    console.error("[admin/reparti GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !REPARTI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "Reparto non valido" }, { status: 400 });
  }
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const ordinePipeline = Number(body.ordinePipeline);
  if (!nome || !Number.isFinite(ordinePipeline)) {
    return NextResponse.json({ error: "Nome o ordine pipeline non validi" }, { status: 400 });
  }
  const capacitaSett = body.capacitaSett != null && body.capacitaSett !== "" ? Number(body.capacitaSett) : null;
  const nRisorseParallele = body.nRisorseParallele != null && body.nRisorseParallele !== "" ? Number(body.nRisorseParallele) : null;
  const wipMax = body.wipMax != null && body.wipMax !== "" ? Number(body.wipMax) : null;
  if ((capacitaSett != null && !(capacitaSett >= 0)) || (nRisorseParallele != null && !(nRisorseParallele >= 0)) || (wipMax != null && !(wipMax >= 0))) {
    return NextResponse.json({ error: "Valori non validi" }, { status: 400 });
  }
  const tamburo = Boolean(body.tamburo);
  const tbd = Boolean(body.tbd);

  try {
    const aggiornato = await aggiornaReparto(id, { nome, ordinePipeline, capacitaSett, nRisorseParallele, wipMax, tamburo, tbd });
    if (!aggiornato) return NextResponse.json({ error: "Reparto non trovato" }, { status: 404 });
    void logOperation(session.name, "UPDATE", "reparto", id, { ...body });
    return NextResponse.json(aggiornato);
  } catch (e) {
    console.error("[admin/reparti PATCH]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
