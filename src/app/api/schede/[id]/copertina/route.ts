import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updateCopertinaScheda, getSchedaById, invalidateSchedeCache } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { id } = await params;
  let body: { imageBase64?: string; filename?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  if (!body.imageBase64 || !body.filename) {
    return NextResponse.json({ error: "Immagine mancante" }, { status: 400 });
  }

  try {
    await updateCopertinaScheda(id, body.imageBase64, body.filename);
    void logOperation(session.name, "UPDATE", "scheda", id, { azione: "upload_copertina", filename: body.filename });
    revalidatePath("/schede");
    invalidateSchedeCache();
    const updated = await getSchedaById(id);
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
