import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { addPianta } from "@/lib/commessePianteRepository";
import { getSessionFromRequest, PIANTE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !PIANTE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { id } = await params;
  let body: { fileBase64?: string; filename?: string; etichetta?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  if (!body.fileBase64 || !body.filename) return NextResponse.json({ error: "File mancante" }, { status: 400 });
  if (!/^data:(application\/pdf|image\/(png|jpeg|webp));base64,/.test(body.fileBase64)) {
    return NextResponse.json({ error: "Formato non supportato: usa PDF, PNG o JPG" }, { status: 400 });
  }
  try {
    const pianta = await addPianta({
      commessaId: id,
      etichetta: (body.etichetta ?? "").trim(),
      fileBase64: body.fileBase64,
      filename: body.filename,
      caricatoDa: session.name,
    });
    void logOperation(session.name, "CREATE", "commessa_pianta", pianta.id, { commessaId: id, filename: body.filename, etichetta: pianta.etichetta });
    revalidatePath(`/commesse/${id}`);
    return NextResponse.json(pianta, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore caricamento pianta" }, { status: 500 });
  }
}
