import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionFromRequest, MODIFICA_SCHEDA_ROLES } from "@/lib/auth";
import { createRilavorazione } from "@/lib/ritiriRepository";
import { appendPdfAllegatoToScheda } from "@/lib/schedeRepository";
import { notionSvc } from "@/lib/verificheServices";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildVerificaPdf } = require("../../../../../../verifiche-backend/pdfBuilder");

type Point = { x: number; y: number };
type Stamp = { x: number; y: number; tipo: string };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
    if (!MODIFICA_SCHEDA_ROLES.includes(session.role)) {
      return NextResponse.json({ ok: false, error: "Permesso negato" }, { status: 403 });
    }

    const { id: parentId } = await params;
    const body = (await req.json()) as {
      descrizione: string;
      fornitoreNome?: string;
      note?: string;
      dataRientro?: string;
      quantita?: number | null;
      creaRitiro?: boolean;
      // PDF annotation (optional)
      sourcePdfPageId?: string;
      strokes?: Record<number, Point[][]>;
      stamps?: Record<number, Stamp[]>;
      fotoBase64?: string[];
    };

    if (!body.descrizione?.trim()) {
      return NextResponse.json({ ok: false, error: "Descrizione obbligatoria" }, { status: 400 });
    }

    const { rilavorazione, subOdp, ritiro } = await createRilavorazione({
      parentId,
      descrizione: body.descrizione.trim(),
      fornitoreNome: body.fornitoreNome,
      note: body.note,
      dataRientro: body.dataRientro,
      quantita: body.quantita,
      creaRitiro: body.creaRitiro,
    });

    // Notifica Telegram (solo se il ritiro è stato effettivamente creato)
    if (ritiro) {
      const webhookUrl = process.env.N8N_WEBHOOK_CARICO_PROD ?? process.env.N8N_WEBHOOK_CARICO;
      if (webhookUrl) {
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "rilavorazione_consegna",
            operatore: session.name,
            odp_label: subOdp,
            fornitore: body.fornitoreNome ?? "",
            descrizione: body.descrizione.trim(),
            data_rientro: body.dataRientro ?? "",
            note: body.note ?? "",
            timestamp: new Date().toISOString(),
          }),
        }).catch((e) => console.warn("[rilavorazione] n8n notify:", e.message));
      }
    }

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
          const pdfBase64 = `data:application/pdf;base64,${pdfBuffer.toString("base64")}`;
          await appendPdfAllegatoToScheda(rilavorazione.id, pdfBase64, filename);
        }
      } catch (pdfErr) {
        // Non blocca la risposta — la rilavorazione è già creata
        console.error("[rilavorazione] PDF upload failed:", pdfErr);
      }
    }

    revalidatePath("/schede");

    return NextResponse.json({ ok: true, odp: rilavorazione.odp, pageId: rilavorazione.id, ritiroCreato: !!ritiro });
  } catch (err) {
    console.error("[rilavorazione] error:", err);
    return NextResponse.json({ ok: false, error: (err as Error).message ?? "Errore interno" }, { status: 500 });
  }
}
