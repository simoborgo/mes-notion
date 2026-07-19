import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { repo, driveSvc, notionSvc, SCHEDA_REGEX } from "@/lib/verificheServices";
import { getAuthClient } from "@/lib/googleDriveAuth";
import { getSessionFromRequest } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildVerificaPdf } = require("../../../../../../verifiche-backend/pdfBuilder");

export async function POST(req: NextRequest, { params }: { params: Promise<{ scheda: string }> }) {
  const { scheda } = await params; // notion_page_id
  if (!SCHEDA_REGEX.test(scheda)) {
    return NextResponse.json({ ok: false, error: "ID scheda non valido" }, { status: 400 });
  }
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "Non autenticato" }, { status: 401 });
  const operatore = session.name;

  const holdsIt = await repo.holdsLock(scheda, operatore);
  if (!holdsIt) {
    return NextResponse.json({ ok: false, error: "Lock non detenuto o scaduto: riapri la scheda" }, { status: 423 });
  }

  try {
    const existing = await repo.findByNotionPageId(scheda);
    if (existing && (existing as Record<string, unknown>).stato === "verificato") {
      return NextResponse.json(
        { ok: false, error: `La scheda è già stata finalizzata`, driveUrl: (existing as Record<string, unknown>).pdf_drive_url },
        { status: 409 }
      );
    }

    const schedaNumero = (existing?.scheda_numero as string | undefined) ?? scheda;

    // ODP label for filenames and PDF text
    let schedaOdp: string = schedaNumero;
    try {
      const body = await req.json() as { schedaOdp?: string };
      if (body.schedaOdp) schedaOdp = body.schedaOdp;
    } catch { /* body assente o non JSON */ }

    const authClient = getAuthClient();

    // Download all photos from Drive (include ALL sessions, not just current)
    const fotoRows = await repo.listFoto(scheda);
    let fotoBuffers: Buffer[] = [];
    if (fotoRows.length > 0) {
      try {
        fotoBuffers = await Promise.all(
          fotoRows.map((f) => driveSvc.downloadFile(authClient, (f as Record<string, unknown>).drive_id as string))
        );
      } catch (e) {
        console.error("[finalize] download foto da Drive fallito:", (e as Error).message);
      }
    }

    // Get original PDF from Notion
    const originalBytes = await notionSvc.getPdfOriginale(scheda);
    if (!originalBytes) {
      return NextResponse.json({ ok: false, error: "PDF originale non trovato su Notion — verifica che la proprietà 'PDF Allegato' sia compilata" }, { status: 404 });
    }

    // Annotations saved in PostgreSQL by the heartbeat/progress calls
    const annotazioni = (existing?.annotazioni as { strokes?: unknown; stamps?: unknown } | null) ?? {};

    // Build annotated PDF with photos server-side
    const pdfBuffer: Buffer = await buildVerificaPdf({
      originalBytes,
      strokes: annotazioni?.strokes ?? {},
      stamps: annotazioni?.stamps ?? {},
      userName: operatore,
      schedaOdp,
      fotoBuffers,
    });

    // Upload annotated PDF to Drive
    const { id, webViewLink } = await driveSvc.uploadVerificaPdf(authClient, pdfBuffer, schedaOdp);

    // Mark as finalized in PostgreSQL
    let record: Record<string, unknown>;
    try {
      record = await repo.finalize({ notionPageId: scheda, operatore, pdfDriveId: id, pdfDriveUrl: webViewLink }) as Record<string, unknown>;
    } catch (err) {
      if ((err as Error & { code?: string }).code === "ALREADY_FINALIZED") {
        return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 409 });
      }
      throw err;
    }

    // Update Notion: Stato → Completato + PDF Scheda Verificata
    let notionError: string | undefined;
    try {
      await notionSvc.aggiornaStatoOdp(scheda, {
        pdfBuffer,
        pdfFilename: `verifica-${schedaOdp}.pdf`,
      });
      await repo.setNotionSyncOk(scheda, true);
    } catch (notionErr) {
      notionError = (notionErr as Error).message;
      console.error("[finalize] aggiornamento Notion fallito:", notionErr);
      await repo.setNotionSyncOk(scheda, false).catch(() => {});
    }

    await repo.appendLog({
      schedaNumero, operatore, azione: "finalizzazione",
      dettaglio: { pdfDriveId: id, dimensioneByte: pdfBuffer.length, fotoCaricate: fotoRows.length, notionOk: !notionError },
    });

    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      const msg = `✅ Verifica spedizione completata\nScheda: ${schedaOdp}\nOperatore: ${operatore}\nFoto: ${fotoRows.length}\nPDF: ${webViewLink}`;
      fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: msg }),
      }).catch((e) => console.error("[finalize] Telegram:", e.message));
    }

    // Invalida cache SSR così la pagina schede è aggiornata al prossimo router.refresh()
    revalidatePath("/spedizioni");

    return NextResponse.json({ ok: true, record, driveUrl: webViewLink, notionError, fotoCount: fotoRows.length });
  } catch (err) {
    console.error("[verifiche/finalize]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
