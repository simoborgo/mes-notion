import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { notionSvc } from "@/lib/verificheServices";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildVerificaPdf } = require("../../../../../../verifiche-backend/pdfBuilder");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { uploadPdfAllegato } = require("../../../../../../verifiche-backend/notionService");

type Point = { x: number; y: number };
type Stamp = { x: number; y: number; tipo: string };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });

  const { id: rilavorazionePageId } = await params;

  const body = await req.json() as {
    strokes: Record<number, Point[][]>;
    stamps: Record<number, Stamp[]>;
    sourcePdfPageId: string;
    schedaOdp: string;
  };

  if (!body.sourcePdfPageId) {
    return NextResponse.json({ ok: false, error: "sourcePdfPageId mancante" }, { status: 400 });
  }

  const originalBytes = await notionSvc.getPdfOriginale(body.sourcePdfPageId);
  if (!originalBytes) {
    return NextResponse.json({ ok: false, error: "PDF non trovato nella scheda sorgente" }, { status: 404 });
  }

  try {
    const pdfBuffer: Buffer = await buildVerificaPdf({
      originalBytes,
      strokes: body.strokes ?? {},
      stamps: body.stamps ?? {},
      userName: session.name,
      schedaOdp: body.schedaOdp ?? rilavorazionePageId,
      fotoBuffers: [],
    });

    const filename = `rilavorazione-${(body.schedaOdp ?? "rila").replace(/\//g, "-")}.pdf`;
    await uploadPdfAllegato(rilavorazionePageId, pdfBuffer, filename);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[annota-pdf]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
