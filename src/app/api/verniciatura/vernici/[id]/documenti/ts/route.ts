import { NextRequest, NextResponse } from "next/server";
import { getVerniceById, setVerniceDriveFolderId, setVerniceTsDocumento } from "@/lib/verniciRepository";
import { getOrCreateVerniceFolder, uploadSchedaTecnica } from "@/lib/googleDriveVerniciatura";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const PDF_MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { id } = await params;

  let file: File | null;
  try {
    const form = await req.formData();
    file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: 'File mancante nel campo "file"' }, { status: 400 });
    if (file.size > PDF_MAX_BYTES) return NextResponse.json({ error: "File oltre i 10 MB" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }

  try {
    const vernice = await getVerniceById(id);
    const buf = Buffer.from(await file.arrayBuffer());

    // Cartella creata/riusata al momento dell'upload (non eagerly alla creazione della vernice).
    const folderId = vernice.driveFolderId ?? (await getOrCreateVerniceFolder(vernice.fornitore, vernice.id));
    const { id: driveFileId } = await uploadSchedaTecnica(folderId, buf);

    if (!vernice.driveFolderId) await setVerniceDriveFolderId(id, folderId);
    await setVerniceTsDocumento(id, driveFileId);

    void logOperation(session.name, "UPDATE", "vernice", id, { documento: "ts", driveFileId });
    return NextResponse.json({ ok: true, driveFileId, driveFolderId: folderId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/verniciatura/vernici/:id/documenti/ts]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
