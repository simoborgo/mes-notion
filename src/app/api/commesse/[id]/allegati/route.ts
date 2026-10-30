import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { addAllegato } from "@/lib/commessaAllegatiRepository";
import { getSpecificaById } from "@/lib/commessaSpecificheRepository";
import { getSessionFromRequest, COMMESSA_CONTENUTO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";
import { CATEGORIE_ALLEGATO } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !COMMESSA_CONTENUTO_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { id } = await params;
  let body: { fileBase64?: string; filename?: string; categoria?: string; specificaId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  if (!body.fileBase64 || !body.filename) return NextResponse.json({ error: "File mancante" }, { status: 400 });
  const categoria = body.categoria ?? "Altro";
  if (!(CATEGORIE_ALLEGATO as readonly string[]).includes(categoria)) return NextResponse.json({ error: "Categoria non valida" }, { status: 400 });

  try {
    if (body.specificaId) {
      const s = await getSpecificaById(body.specificaId);
      if (!s || s.commessaId !== id) return NextResponse.json({ error: "Specifica non trovata" }, { status: 404 });
    }
    const allegato = await addAllegato({
      commessaId: id,
      specificaId: body.specificaId ?? null,
      categoria: categoria as (typeof CATEGORIE_ALLEGATO)[number],
      fileBase64: body.fileBase64,
      filename: body.filename,
      caricatoDa: session.name,
    });
    void logOperation(session.name, "CREATE", "commessa_allegato", allegato.id, { commessaId: id, filename: body.filename, categoria, specificaId: body.specificaId ?? null });
    revalidatePath(`/commesse/${id}`);
    return NextResponse.json(allegato, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore caricamento file" }, { status: 500 });
  }
}
