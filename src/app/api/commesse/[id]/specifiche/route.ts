import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createSpecifica } from "@/lib/commessaSpecificheRepository";
import { getSessionFromRequest, COMMESSA_CONTENUTO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";
import { TIPI_SPECIFICA, STATI_SPECIFICA } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !COMMESSA_CONTENUTO_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();
    const titolo = typeof body.titolo === "string" ? body.titolo.trim() : "";
    if (!titolo) return NextResponse.json({ error: "Titolo obbligatorio" }, { status: 400 });
    if (!TIPI_SPECIFICA.includes(body.tipo)) return NextResponse.json({ error: "Tipo non valido" }, { status: 400 });
    if (body.stato !== undefined && !STATI_SPECIFICA.includes(body.stato)) return NextResponse.json({ error: "Stato non valido" }, { status: 400 });

    const specifica = await createSpecifica({
      commessaId: id,
      tipo: body.tipo,
      titolo,
      descrizione: typeof body.descrizione === "string" ? body.descrizione.trim() : "",
      stato: body.stato,
      creatoDa: session.name,
    });
    void logOperation(session.name, "CREATE", "commessa_specifica", specifica.id, { commessaId: id, tipo: specifica.tipo, titolo });
    revalidatePath(`/commesse/${id}`);
    return NextResponse.json(specifica, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore creazione specifica" }, { status: 500 });
  }
}
