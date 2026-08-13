import { NextRequest, NextResponse } from "next/server";
import { getCommessaById } from "@/lib/commesseRepository";
import { confermaOfferta } from "@/lib/offerteRepository";
import { getSessionFromRequest, OFFERTE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !OFFERTE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const commessaId = typeof body.commessaId === "string" ? body.commessaId : null;
  if (!commessaId) {
    return NextResponse.json({ error: "Seleziona la Commessa collegata" }, { status: 400 });
  }
  try {
    const commessa = await getCommessaById(commessaId);
    const offerta = await confermaOfferta(id, commessaId, commessa.dataCarico);
    if (!offerta) return NextResponse.json({ error: "Offerta non trovata o non più in stato 'Offerta'" }, { status: 400 });
    void logOperation(session.name, "UPDATE", "offerta", id, { azione: "conferma", commessaId });
    return NextResponse.json(offerta);
  } catch (e) {
    console.error("[offerte/[id]/conferma POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
