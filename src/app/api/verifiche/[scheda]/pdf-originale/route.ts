import { NextRequest, NextResponse } from "next/server";
import { notionSvc, SCHEDA_REGEX } from "@/lib/verificheServices";
import { getSessionFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ scheda: string }> }) {
  const { scheda } = await params; // notion_page_id — usato direttamente per fetch Notion
  if (!SCHEDA_REGEX.test(scheda)) {
    return NextResponse.json({ ok: false, error: `ID scheda non valido` }, { status: 400 });
  }
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "Non autenticato" }, { status: 401 });

  try {
    const buffer = await notionSvc.getPdfOriginale(scheda);
    if (!buffer) {
      return NextResponse.json({ ok: false, error: "Nessun PDF nella property 'PDF Allegato' su Notion" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    });
  } catch (err) {
    console.error("[verifiche/pdf-originale]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
