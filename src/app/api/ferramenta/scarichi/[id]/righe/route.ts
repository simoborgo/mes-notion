import { NextRequest, NextResponse } from "next/server";
import { aggiungiRigaScarico } from "@/lib/scaricoRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const articoloId = typeof body.articoloId === "string" ? body.articoloId : null;
  const quantita = Number(body.quantita);
  if (!articoloId || !(quantita > 0)) {
    return NextResponse.json({ error: "Articolo e quantità (> 0) obbligatori" }, { status: 400 });
  }
  try {
    const riga = await aggiungiRigaScarico({ scaricoId: id, articoloId, quantita });
    void logOperation(session.name, "CREATE", "scarico", id, { articoloId, quantita });
    return NextResponse.json(riga);
  } catch (e) {
    console.error("[scarichi/[id]/righe POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
