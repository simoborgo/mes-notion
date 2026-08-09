import { NextRequest, NextResponse } from "next/server";
import { getCampionatureByCodicePubblico } from "@/lib/campionatureVerniciaturaRepository";
import { getSessionFromRequest } from "@/lib/auth";

// Entry point del flusso produzione: scan barcode -> campionatura -> ciclo -> vernici.
// Il barcode non è univoco per design (riuso intenzionale tra commesse): ritorna tutte le
// righe con quel codice, più recente per prima.
export async function GET(req: NextRequest, { params }: { params: Promise<{ codicePubblico: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  try {
    const { codicePubblico } = await params;
    const campionature = await getCampionatureByCodicePubblico(codicePubblico);
    if (campionature.length === 0) {
      return NextResponse.json({ error: `Nessuna campionatura trovata per il barcode "${codicePubblico}"` }, { status: 404 });
    }
    return NextResponse.json(campionature);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nella ricerca per barcode" }, { status: 500 });
  }
}
