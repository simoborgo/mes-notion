import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getPiantaById, rinominaPianta, sostituisciFilePianta, deletePianta } from "@/lib/commessePianteRepository";
import { getSessionFromRequest, PIANTE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; pianteId: string }> };

// Rinomina (etichetta) e/o sostituisce il file di una pianta, senza perderne posizione e zone.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getSessionFromRequest(req);
  if (!session || !PIANTE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { id, pianteId } = await params;
  let body: { etichetta?: string; fileBase64?: string; filename?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  try {
    const p = await getPiantaById(pianteId);
    if (!p || p.commessaId !== id) return NextResponse.json({ error: "Pianta non trovata" }, { status: 404 });
    let aggiornata = p;
    if (body.fileBase64 && body.filename) {
      if (!/^data:(application\/pdf|image\/(png|jpeg|webp));base64,/.test(body.fileBase64)) {
        return NextResponse.json({ error: "Formato non supportato: usa PDF, PNG o JPG" }, { status: 400 });
      }
      aggiornata = await sostituisciFilePianta(pianteId, { fileBase64: body.fileBase64, filename: body.filename, caricatoDa: session.name });
    }
    if (body.etichetta !== undefined) aggiornata = await rinominaPianta(pianteId, body.etichetta.trim());
    void logOperation(session.name, "UPDATE", "commessa_pianta", pianteId, { commessaId: id, etichetta: aggiornata.etichetta, filename: aggiornata.nomeFile });
    revalidatePath(`/commesse/${id}`);
    return NextResponse.json(aggiornata);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore aggiornamento pianta" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !PIANTE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id, pianteId } = await params;
    const p = await getPiantaById(pianteId);
    if (!p || p.commessaId !== id) return NextResponse.json({ error: "Pianta non trovata" }, { status: 404 });
    await deletePianta(pianteId);
    void logOperation(session.name, "DELETE", "commessa_pianta", pianteId, { commessaId: id, filename: p.nomeFile });
    revalidatePath(`/commesse/${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore eliminazione pianta" }, { status: 500 });
  }
}
