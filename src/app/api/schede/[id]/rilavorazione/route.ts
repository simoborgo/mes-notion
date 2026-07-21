import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionFromRequest } from "@/lib/auth";
import {
  getSchedaById,
  createSchedaPage,
  updateSchedaStato,
  findFornitoreIdByName,
  getNextRilavorazioneOdp,
} from "@/lib/notion";
import { notionSvc } from "@/lib/verificheServices";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildVerificaPdf } = require("../../../../../../verifiche-backend/pdfBuilder");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { uploadPdfAllegato } = require("../../../../../../verifiche-backend/notionService");

type Point = { x: number; y: number };
type Stamp = { x: number; y: number; tipo: string };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });

    const { id: parentId } = await params;
    const body = (await req.json()) as {
      descrizione: string;
      fornitoreNome?: string;
      note?: string;
      dataRientro?: string;
      quantita?: number | null;
      // PDF annotation (optional)
      sourcePdfPageId?: string;
      strokes?: Record<number, Point[][]>;
      stamps?: Record<number, Stamp[]>;
      fotoBase64?: string[];
    };

    if (!body.descrizione?.trim()) {
      return NextResponse.json({ ok: false, error: "Descrizione obbligatoria" }, { status: 400 });
    }

    const parent = await getSchedaById(parentId);

    const [subOdp, fornitoreId] = await Promise.all([
      getNextRilavorazioneOdp(parentId, parent.odp),
      body.fornitoreNome ? findFornitoreIdByName(body.fornitoreNome) : Promise.resolve(null),
    ]);

    const rilavorazione = await createSchedaPage({
      numeroScheda: body.descrizione.trim(),
      commessaId: parent.commessaId,
      odp: subOdp,
      tipologia: "Rilavorazione",
      stato: "In Lavorazione Esterna",
      fornitore: body.fornitoreNome ?? null,
      fornitoreId,
      note: body.note ?? null,
      dataProduzionePrevista: body.dataRientro ?? null,
      quantita: body.quantita ?? parent.quantita ?? null,
      parentId,
    });

    await updateSchedaStato(parentId, "In Attesa Rilavorazione");

    // Build + upload flattened PDF (with optional annotations and photos)
    if (body.sourcePdfPageId) {
      try {
        const originalBytes = await notionSvc.getPdfOriginale(body.sourcePdfPageId);
        if (originalBytes) {
          const fotoBuffers: Buffer[] = (body.fotoBase64 ?? []).map((b64) => {
            const base64Data = b64.replace(/^data:[^;]+;base64,/, "");
            return Buffer.from(base64Data, "base64");
          });

          const pdfBuffer: Buffer = await buildVerificaPdf({
            originalBytes,
            strokes: body.strokes ?? {},
            stamps: body.stamps ?? {},
            userName: session.name,
            schedaOdp: subOdp,
            fotoBuffers,
          });

          const filename = `rilavorazione-${subOdp.replace(/\//g, "-")}.pdf`;
          await uploadPdfAllegato(rilavorazione.id, pdfBuffer, filename);
        }
      } catch (pdfErr) {
        // Non bloccare la risposta se il PDF fallisce — la rilavorazione è già creata
        console.error("[rilavorazione] PDF upload failed:", pdfErr);
      }
    }

    revalidatePath("/schede");

    return NextResponse.json({ ok: true, odp: rilavorazione.odp, pageId: rilavorazione.id });
  } catch (err) {
    console.error("[rilavorazione] error:", err);
    return NextResponse.json({ ok: false, error: (err as Error).message ?? "Errore interno" }, { status: 500 });
  }
}
