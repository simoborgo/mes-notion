import { NextRequest, NextResponse } from "next/server";
import { deleteFoto } from "@/lib/schedeVerniciaturaRepository";
import { deleteDriveFile } from "@/lib/googleDriveVerniciatura";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; fotoId: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id, fotoId } = await params;

    const { driveFileId } = await deleteFoto(id, fotoId);
    await deleteDriveFile(driveFileId).catch((e) => console.error("[DELETE foto] Drive cleanup fallito:", e));

    void logOperation(session.name, "DELETE", "scheda_verniciatura", id, { azione: "rimozione_foto", fotoId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/verniciatura/schede/:id/foto/:fotoId]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
