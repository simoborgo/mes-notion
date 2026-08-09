import { NextRequest, NextResponse } from "next/server";
import { getVerniceById, setVerniceDriveFolderId } from "@/lib/verniciRepository";
import { getLaboratorioById } from "@/lib/laboratoriRepository";
import { getOrCreateVerniceFolder } from "@/lib/googleDriveVerniciatura";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Riparazione manuale: se la creazione della cartella Drive è fallita in un upload precedente
// (drive_folder_id rimasto NULL dopo il commit Postgres), la ritenta senza caricare nulla.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { id } = await params;

  try {
    const vernice = await getVerniceById(id);
    if (vernice.driveFolderId) {
      return NextResponse.json({ ok: true, driveFolderId: vernice.driveFolderId, giaPresente: true });
    }
    const fornitoreNome = vernice.fornitoreId ? (await getLaboratorioById(vernice.fornitoreId)).nome : null;
    const folderId = await getOrCreateVerniceFolder(fornitoreNome, vernice.id);
    await setVerniceDriveFolderId(id, folderId);

    void logOperation(session.name, "UPDATE", "vernice", id, { riparaDrive: true, driveFolderId: folderId });
    return NextResponse.json({ ok: true, driveFolderId: folderId, giaPresente: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/verniciatura/vernici/:id/ripara-drive]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
