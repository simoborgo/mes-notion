import { NextRequest, NextResponse } from "next/server";
import { getScaricoConRighe } from "@/lib/scaricoRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const risultato = await getScaricoConRighe(id);
    if (!risultato) return NextResponse.json({ error: "Scarico non trovato" }, { status: 404 });
    return NextResponse.json(risultato);
  } catch (e) {
    console.error("[scarichi/[id] GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
