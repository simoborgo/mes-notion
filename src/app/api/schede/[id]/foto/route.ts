import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { appendFotoToPage, getSchedaById, invalidateSchedeCache } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { id } = await params;
  let body: { fotoBase64?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  if (!body.fotoBase64?.length) {
    return NextResponse.json({ error: "Nessuna foto ricevuta" }, { status: 400 });
  }

  try {
    await appendFotoToPage(id, body.fotoBase64);
    void logOperation(session.name, "UPDATE", "scheda", id, { azione: "upload_foto", numeroFoto: body.fotoBase64.length });
    revalidatePath("/schede");
    invalidateSchedeCache();
    const updated = await getSchedaById(id);
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
