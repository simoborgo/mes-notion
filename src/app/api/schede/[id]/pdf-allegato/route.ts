import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { appendPdfAllegatoToScheda, getSchedaById } from "@/lib/schedeRepository";
import { getSessionFromRequest, MODIFICA_SCHEDA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MODIFICA_SCHEDA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { id } = await params;
  let body: { pdfBase64?: string; filename?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  if (!body.pdfBase64 || !body.filename) {
    return NextResponse.json({ error: "PDF mancante" }, { status: 400 });
  }

  try {
    await appendPdfAllegatoToScheda(id, body.pdfBase64, body.filename);
    void logOperation(session.name, "UPDATE", "scheda", id, { azione: "upload_pdf_allegato", filename: body.filename });
    revalidatePath("/schede");
    const updated = await getSchedaById(id);
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
