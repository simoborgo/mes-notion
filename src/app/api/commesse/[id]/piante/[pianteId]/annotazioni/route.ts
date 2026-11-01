import { NextRequest, NextResponse } from "next/server";
import { getPiantaById, saveAnnotazioniPianta } from "@/lib/commessePianteRepository";
import { getSessionFromRequest, COMMESSA_CONTENUTO_ROLES } from "@/lib/auth";

// Salvataggio automatico dei segni (sostituisce tutto: l'ultimo che salva vince).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; pianteId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !COMMESSA_CONTENUTO_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { id, pianteId } = await params;
  let body: { strokes?: Record<string, unknown>; stamps?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  const p = await getPiantaById(pianteId);
  if (!p || p.commessaId !== id) return NextResponse.json({ error: "Pianta non trovata" }, { status: 404 });
  try {
    await saveAnnotazioniPianta(pianteId, { strokes: body.strokes ?? {}, stamps: body.stamps ?? {} }, session.name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore salvataggio segni" }, { status: 500 });
  }
}
