import { NextRequest, NextResponse } from "next/server";
import { getCampionaturaById, setCampionaturaDriveFolderId } from "@/lib/campionatureVerniciaturaRepository";
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
    const campionatura = await getCampionaturaById(id);
    if (campionatura.driveFolderId) {
      return NextResponse.json({ ok: true, driveFolderId: campionatura.driveFolderId, giaPresente: true });
    }
    const folderId = await getOrCreateCampionaturaFolder(campionatura.cliente, campionatura.codicePubblico);
    await setCampionaturaDriveFolderId(id, folderId);

    void logOperation(session.name, "UPDATE", "campionatura_verniciatura", id, { riparaDrive: true, driveFolderId: folderId });
    return NextResponse.json({ ok: true, driveFolderId: folderId, giaPresente: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/verniciatura/campionature/:id/ripara-drive]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
