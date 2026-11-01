import { NextRequest, NextResponse } from "next/server";
import { getRighePerCommessa } from "@/lib/offerteRepository";
import { getSessionFromRequest } from "@/lib/auth";

// Righe articolo dell'offerta Confermata di una commessa, per il menu nella scheda.
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const commessaId = req.nextUrl.searchParams.get("commessaId");
  if (!commessaId) return NextResponse.json({ error: "commessaId obbligatorio" }, { status: 400 });
  try {
    return NextResponse.json(await getRighePerCommessa(commessaId));
  } catch (e) {
    console.error("[offerte-righe GET]", e);
    return NextResponse.json({ error: "Errore nel recupero delle righe" }, { status: 500 });
  }
}
