import { NextRequest, NextResponse } from "next/server";
import { getSchedeByVerniciaturaId } from "@/lib/schedeRepository";
import { getSessionFromRequest } from "@/lib/auth";

// Vista reverse per la sezione "Usata in questi ODP" nella modale Scheda di Verniciatura —
// sola lettura, nessun permesso specifico oltre l'autenticazione (stesso livello di GET .../[id]).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  try {
    const { id } = await params;
    const odp = await getSchedeByVerniciaturaId(id);
    return NextResponse.json(odp);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero ODP collegati" }, { status: 500 });
  }
}
