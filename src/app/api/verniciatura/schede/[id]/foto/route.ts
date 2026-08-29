import { NextRequest, NextResponse } from "next/server";
import { getSchedaById, setSchedaDriveFolderId, addFoto } from "@/lib/schedeVerniciaturaRepository";
import { getOrCreateCampionaturaFolder, uploadFotoCampionatura } from "@/lib/googleDriveVerniciatura";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const FOTO_MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { id } = await params;

  let file: File | null;
  try {
    const form = await req.formData();
    file = form.get("foto") as File | null;
    if (!file) return NextResponse.json({ error: 'Foto mancante nel campo "foto"' }, { status: 400 });
    if (file.size > FOTO_MAX_BYTES) return NextResponse.json({ error: "Foto oltre i 10 MB" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }

  try {
    const scheda = await getSchedaById(id);
    if (!scheda.cliente || !scheda.codicePubblico) {
      return NextResponse.json({ error: "Impossibile caricare foto: scheda senza cliente/barcode" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());

    const folderId = scheda.driveFolderId ?? (await getOrCreateCampionaturaFolder(scheda.cliente, scheda.codicePubblico));
    const progressivo = (scheda.foto?.length ?? 0) + 1;
    const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const { id: driveFileId } = await uploadFotoCampionatura(folderId, buf, progressivo, mimeType);

    if (!scheda.driveFolderId) await setSchedaDriveFolderId(id, folderId);
    const aggiornata = await addFoto(id, { driveFileId, nomeFile: file.name, ordine: progressivo });

    void logOperation(session.name, "UPLOAD_FOTO", "scheda_verniciatura", id, { driveFileId });
    return NextResponse.json(aggiornata, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/verniciatura/schede/:id/foto]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
