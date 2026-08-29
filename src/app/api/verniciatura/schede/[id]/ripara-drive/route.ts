import { NextRequest, NextResponse } from "next/server";
import { getSchedaById, setSchedaDriveFolderId } from "@/lib/schedeVerniciaturaRepository";
import { getOrCreateCampionaturaFolder } from "@/lib/googleDriveVerniciatura";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { id } = await params;

  try {
    const scheda = await getSchedaById(id);
    if (scheda.driveFolderId) {
      return NextResponse.json({ ok: true, driveFolderId: scheda.driveFolderId, giaPresente: true });
    }
    if (!scheda.cliente || !scheda.codicePubblico) {
      return NextResponse.json({ error: "Impossibile creare la cartella Drive: scheda senza cliente/barcode" }, { status: 400 });
    }
    const folderId = await getOrCreateCampionaturaFolder(scheda.cliente, scheda.codicePubblico);
    await setSchedaDriveFolderId(id, folderId);

    void logOperation(session.name, "UPDATE", "scheda_verniciatura", id, { riparaDrive: true, driveFolderId: folderId });
    return NextResponse.json({ ok: true, driveFolderId: folderId, giaPresente: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/verniciatura/schede/:id/ripara-drive]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
