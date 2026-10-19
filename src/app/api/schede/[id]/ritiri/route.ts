import { NextRequest, NextResponse } from "next/server";
import { getRitiriByScheda } from "@/lib/ritiriRepository";
import { getSessionFromRequest } from "@/lib/auth";

// Movimenti di Ritiri e Consegne collegati alla scheda (tab Fornitore Esterno).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  try {
    const { id } = await params;
    return NextResponse.json(await getRitiriByScheda(id));
  } catch (e) {
    console.error("[GET /api/schede/[id]/ritiri]", e);
    return NextResponse.json({ error: "Errore lettura movimenti" }, { status: 500 });
  }
}
