import { NextRequest, NextResponse } from "next/server";
import { repo, driveSvc, notionSvc, SCHEDA_REGEX } from "@/lib/verificheServices";
import { getAuthClient } from "@/lib/googleDriveAuth";
import { getSessionFromRequest } from "@/lib/auth";

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

    const form = await req.formData();
    const pdfFile = form.get("pdf") as File | null;
    if (!pdfFile) return NextResponse.json({ ok: false, error: 'PDF mancante nel campo "pdf"' }, { status: 400 });
    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());

    const authClient = getAuthClient();
    const { id, webViewLink } = await driveSvc.uploadVerificaPdf(authClient, pdfBuffer, schedaNumero);

    let record: Record<string, unknown>;
    try {
      record = await repo.finalize({ notionPageId: scheda, operatore, pdfDriveId: id, pdfDriveUrl: webViewLink }) as Record<string, unknown>;
    } catch (err) {
      if ((err as Error & { code?: string }).code === "ALREADY_FINALIZED") {
        return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 409 });
      }
      throw err;
    }

    const fotoRows = await repo.listFoto(scheda);
    let fotoBuffers: Buffer[] = [];
    try {
      fotoBuffers = await Promise.all(fotoRows.map((f) => driveSvc.downloadFile(authClient, (f as Record<string, unknown>).drive_id as string)));
    } catch (e) {
      console.error("[finalize] download foto da Drive fallito:", (e as Error).message);
    }

    try {
      await notionSvc.aggiornaStatoOdp(scheda, {
        statoValue: "Verificato",
        pdfUrl: webViewLink,
        pdfBuffer,
        pdfFilename: `verifica-${schedaNumero}.pdf`,
        fotoBuffers,
      });
      await repo.setNotionSyncOk(scheda, true);
    } catch (notionErr) {
      console.error("[finalize] aggiornamento Notion fallito:", notionErr);
      await repo.setNotionSyncOk(scheda, false).catch(() => {});
    }

    await repo.appendLog({
      schedaNumero, operatore, azione: "finalizzazione",
      dettaglio: { pdfDriveId: id, dimensioneByte: pdfBuffer.length, fotoCaricate: fotoRows.length },
    });

    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      const msg = `✅ Verifica spedizione completata\nScheda: ${schedaNumero}\nOperatore: ${operatore}\nFoto: ${fotoRows.length}\nPDF: ${webViewLink}`;
      fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: msg }),
      }).catch((e) => console.error("[finalize] Telegram:", e.message));
    }

    return NextResponse.json({ ok: true, record, driveUrl: webViewLink });
  } catch (err) {
    console.error("[verifiche/finalize]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
