import { NextRequest, NextResponse } from "next/server";
import { getSchedaById } from "@/lib/schedeRepository";
import { getRitiroById } from "@/lib/ritiriRepository";
import { getSessionFromRequest } from "@/lib/auth";
import { notionSvc } from "@/lib/verificheServices";

// Proxy verso il PDF Allegato della scheda collegata al ritiro.
// Rilegge sempre Notion al momento della richiesta (link firmati Notion scadono
// dopo circa un'ora) — così il QR sull'etichetta stampata resta valido nel tempo.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  try {
    const ritiro = await getRitiroById(id);
    if (!ritiro.numeroOrdineId) {
      return NextResponse.json({ error: "Nessuna scheda collegata a questo movimento" }, { status: 404 });
    }

    let buffer = await notionSvc.getPdfOriginale(ritiro.numeroOrdineId);
    // Le rilavorazioni create dallo shortcut NC non hanno un proprio PDF Allegato:
    // ricade sul PDF della scheda padre (il disegno tecnico originale)
    if (!buffer) {
      const scheda = await getSchedaById(ritiro.numeroOrdineId);
      if (scheda.parentId) {
        buffer = await notionSvc.getPdfOriginale(scheda.parentId);
      }
    }
    if (!buffer) {
      return NextResponse.json({ error: "Nessun PDF allegato alla scheda" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="scheda-${(ritiro.numeroOrdine || id).replace(/\//g, "-")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[scheda-pdf]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
