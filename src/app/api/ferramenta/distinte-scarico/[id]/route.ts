import { NextRequest, NextResponse } from "next/server";
import { getDistintaConRighe } from "@/lib/distinteScaricoRepository";
import { getSessionFromRequest, DISTINTE_SCARICO_CREA_ROLES } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !DISTINTE_SCARICO_CREA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const risultato = await getDistintaConRighe(id);
    if (!risultato) return NextResponse.json({ error: "Distinta non trovata" }, { status: 404 });
    return NextResponse.json(risultato);
  } catch (e) {
    console.error("[distinte-scarico/[id] GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
