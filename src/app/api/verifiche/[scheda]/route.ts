import { NextRequest, NextResponse } from "next/server";
import { repo, driveSvc, SCHEDA_REGEX } from "@/lib/verificheServices";
import { getSessionFromRequest } from "@/lib/auth";
import { getAuthClient } from "@/lib/googleDriveAuth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ scheda: string }> }) {
  const { scheda } = await params;
  if (!SCHEDA_REGEX.test(scheda)) {
    return NextResponse.json({ ok: false, error: `ID scheda non valido: "${scheda}"` }, { status: 400 });
  }
  try {
    const record = await repo.findByNotionPageId(scheda);
    if (!record) return NextResponse.json({ ok: false, error: "Scheda non trovata" }, { status: 404 });
    const foto = await repo.listFoto(scheda);
    return NextResponse.json({ ok: true, record, foto });
  } catch (err) {
    console.error("[verifiche/:scheda GET]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ scheda: string }> }) {
  const { scheda } = await params;
  if (!SCHEDA_REGEX.test(scheda)) {
    return NextResponse.json({ ok: false, error: `ID scheda non valido: "${scheda}"` }, { status: 400 });
  }
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "Non autenticato" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ ok: false, error: "Solo admin" }, { status: 403 });

  try {
    const fotos = await repo.listFoto(scheda);
    const record = await repo.findByNotionPageId(scheda);
    const deleted = await repo.deleteScheda(scheda);
    if (!deleted) return NextResponse.json({ ok: false, error: "Scheda non trovata" }, { status: 404 });

    if (fotos.length > 0) {
      const auth = await getAuthClient();
      for (const f of fotos) {
        const driveId = (f as Record<string, unknown>).drive_id as string | undefined;
        if (driveId) await driveSvc.deleteFile(auth, driveId).catch(() => {});
      }
    }

    await repo.appendLog({ schedaNumero: (record?.scheda_numero as string) ?? scheda, operatore: session.name, azione: "eliminata_admin", dettaglio: { fotoRimosse: fotos.length } }).catch(() => {});
    return NextResponse.json({ ok: true, fotoRimosse: fotos.length });
  } catch (err) {
    console.error("[verifiche/:scheda DELETE]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
