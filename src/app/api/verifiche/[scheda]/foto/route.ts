import { NextRequest, NextResponse } from "next/server";
import { repo, driveSvc, SCHEDA_REGEX } from "@/lib/verificheServices";
import { getAuthClient } from "@/lib/googleDriveAuth";
import { getSessionFromRequest } from "@/lib/auth";

const FOTO_MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ scheda: string }> }) {
  const { scheda } = await params; // notion_page_id
  if (!SCHEDA_REGEX.test(scheda)) {
    return NextResponse.json({ ok: false, error: `ID scheda non valido` }, { status: 400 });
  }
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "Non autenticato" }, { status: 401 });
  const operatore = session.name;

  const holdsIt = await repo.holdsLock(scheda, operatore);
  if (!holdsIt) {
    return NextResponse.json({ ok: false, error: "Lock non detenuto o scaduto: riapri la scheda" }, { status: 423 });
  }

  try {
    const form = await req.formData();
    const file = form.get("foto") as File | null;
    if (!file) return NextResponse.json({ ok: false, error: 'Foto mancante nel campo "foto"' }, { status: 400 });
    if (file.size > FOTO_MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "Foto oltre i 2MB" }, { status: 400 });
    }

    const record = await repo.findByNotionPageId(scheda);
    const schedaNumero = (record?.scheda_numero as string | undefined) ?? null;
    const buf = Buffer.from(await file.arrayBuffer());
    const count = (await repo.listFoto(scheda)).length;
    const authClient = getAuthClient();
    const { id, webViewLink } = await driveSvc.uploadFotoVerifica(authClient, buf, schedaNumero ?? scheda, count + 1);
    const foto = await repo.addFoto({ notionPageId: scheda, schedaNumero, driveId: id, driveUrl: webViewLink, operatore });
    await repo.appendLog({ schedaNumero: schedaNumero ?? scheda, operatore, azione: "foto_aggiunta", dettaglio: { fotoId: (foto as Record<string, unknown>).id, driveId: id } });

    return NextResponse.json({ ok: true, foto });
  } catch (err) {
    console.error("[verifiche/foto POST]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
