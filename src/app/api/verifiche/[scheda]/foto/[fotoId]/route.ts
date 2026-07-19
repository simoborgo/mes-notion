import { NextRequest, NextResponse } from "next/server";
import { repo, driveSvc, SCHEDA_REGEX } from "@/lib/verificheServices";
import { getAuthClient } from "@/lib/googleDriveAuth";
import { getSessionFromRequest } from "@/lib/auth";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ scheda: string; fotoId: string }> }) {
  const { scheda, fotoId } = await params; // scheda = notion_page_id
  if (!SCHEDA_REGEX.test(scheda)) {
    return NextResponse.json({ ok: false, error: "ID scheda non valido" }, { status: 400 });
  }
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "Non autenticato" }, { status: 401 });
  const operatore = session.name;

  const holdsIt = await repo.holdsLock(scheda, operatore);
  if (!holdsIt) {
    return NextResponse.json({ ok: false, error: "Lock non detenuto o scaduto" }, { status: 423 });
  }

  try {
    const removed = await repo.removeFoto(fotoId);
    if (!removed) return NextResponse.json({ ok: false, error: "Foto non trovata" }, { status: 404 });

    try {
      const authClient = getAuthClient();
      await driveSvc.deleteFile(authClient, (removed as Record<string, unknown>).drive_id as string);
    } catch (e) {
      console.error("[verifiche/foto DELETE] Drive cleanup fallita:", (e as Error).message);
    }

    const schedaNumero = (removed as Record<string, unknown>).scheda_numero as string | undefined;
    await repo.appendLog({ schedaNumero: schedaNumero ?? scheda, operatore, azione: "foto_rimossa", dettaglio: { fotoId, driveId: (removed as Record<string, unknown>).drive_id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
