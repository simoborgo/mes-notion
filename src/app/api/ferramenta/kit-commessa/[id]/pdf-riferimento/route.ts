import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { setPdfRiferimento } from "@/lib/kitCommessaRepository";
import { getOrCreateKitCommessaFolder, uploadPdfRiferimento } from "@/lib/googleDriveKitCommessa";
import { getSessionFromRequest, KIT_COMMESSA_CREA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const PDF_MAX_BYTES = 15 * 1024 * 1024;

// Solo allegato di riferimento (consultabile dal magazziniere) — nessuna estrazione automatica
// di righe da qui, a differenza dell'import Excel.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !KIT_COMMESSA_CREA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;

  let file: File | null;
  try {
    const form = await req.formData();
    file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: 'File mancante nel campo "file"' }, { status: 400 });
    if (file.size > PDF_MAX_BYTES) return NextResponse.json({ error: "File oltre i 15 MB" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const folderId = await getOrCreateKitCommessaFolder(id);
    const { id: driveFileId } = await uploadPdfRiferimento(folderId, buf, file.name || "riferimento.pdf");
    await setPdfRiferimento(id, driveFileId, file.name || "riferimento.pdf");
    void logOperation(session.name, "UPDATE", "kit_commessa", id, { azione: "pdf-riferimento", driveFileId });
    revalidatePath(`/ferramenta/kit-commessa/${id}`);
    return NextResponse.json({ ok: true, driveFileId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[kit-commessa/pdf-riferimento]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
