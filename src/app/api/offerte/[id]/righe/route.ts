import { NextRequest, NextResponse } from "next/server";
import { aggiungiRigaOfferta } from "@/lib/offerteRepository";
import { getSessionFromRequest, OFFERTE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !OFFERTE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const codiceArticolo = typeof body.codiceArticolo === "string" ? body.codiceArticolo : null;
  const quantita = Number(body.quantita);
  const orePreventivate = Number(body.orePreventivate);
  if (!codiceArticolo || !(quantita > 0) || !(orePreventivate > 0)) {
    return NextResponse.json({ error: "Articolo, quantità e ore preventivate (> 0) sono obbligatori" }, { status: 400 });
  }
  try {
    const riga = await aggiungiRigaOfferta({ offertaId: id, codiceArticolo, quantita, orePreventivate });
    void logOperation(session.name, "CREATE", "offerta", id, { codiceArticolo, quantita, orePreventivate });
    return NextResponse.json(riga);
  } catch (e) {
    console.error("[offerte/[id]/righe POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
