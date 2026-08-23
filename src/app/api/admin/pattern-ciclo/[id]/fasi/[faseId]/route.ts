import { NextRequest, NextResponse } from "next/server";
import { aggiornaFasePattern, eliminaFasePattern } from "@/lib/patternCicloRepository";
import { getSessionFromRequest, REPARTI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; faseId: string }> }) {
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
    const { id, faseId } = await params;
    const fase = await aggiornaFasePattern(faseId, {
      repartoId, ordine,
      sottoFase: body.sottoFase || null,
      condizionale, condizione,
      parallellizzabile: Boolean(body.parallellizzabile),
      tempoAttrezzaggioOre,
    });
    if (!fase) return NextResponse.json({ error: "Fase non trovata" }, { status: 404 });
    void logOperation(session.name, "UPDATE", "pattern_ciclo", id, { azione: "modifica_fase", faseId });
    return NextResponse.json(fase);
  } catch (e) {
    console.error("[admin/pattern-ciclo/[id]/fasi/[faseId] PATCH]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; faseId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !REPARTI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    const { id, faseId } = await params;
    const risultato = await eliminaFasePattern(faseId);
    if (risultato.inUso) {
      return NextResponse.json({ error: "Questa fase è già stata usata per generare le fasi di uno o più ODP: non può essere eliminata." }, { status: 409 });
    }
    if (!risultato.ok) return NextResponse.json({ error: "Fase non trovata" }, { status: 404 });
    void logOperation(session.name, "DELETE", "pattern_ciclo", id, { azione: "elimina_fase", faseId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/pattern-ciclo/[id]/fasi/[faseId] DELETE]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
