import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSpecificaById, updateSpecifica, deleteSpecifica } from "@/lib/commessaSpecificheRepository";
import { getSessionFromRequest, COMMESSA_CONTENUTO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";
import { TIPI_SPECIFICA, STATI_SPECIFICA } from "@/lib/types";

type Ctx = { params: Promise<{ id: string; specificaId: string }> };

// La specifica deve appartenere alla commessa dell'URL: evita di toccare voci di altre commesse.
async function carica(id: string, specificaId: string) {
  const s = await getSpecificaById(specificaId);
  return s && s.commessaId === id ? s : null;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !COMMESSA_CONTENUTO_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id, specificaId } = await params;
    if (!(await carica(id, specificaId))) return NextResponse.json({ error: "Specifica non trovata" }, { status: 404 });

    const body = await req.json();
    if (body.tipo !== undefined && !TIPI_SPECIFICA.includes(body.tipo)) return NextResponse.json({ error: "Tipo non valido" }, { status: 400 });
    if (body.stato !== undefined && !STATI_SPECIFICA.includes(body.stato)) return NextResponse.json({ error: "Stato non valido" }, { status: 400 });
    if (body.titolo !== undefined && !String(body.titolo).trim()) return NextResponse.json({ error: "Titolo obbligatorio" }, { status: 400 });

    const changes = {
      tipo: body.tipo,
      titolo: body.titolo !== undefined ? String(body.titolo).trim() : undefined,
      descrizione: body.descrizione !== undefined ? String(body.descrizione).trim() : undefined,
      stato: body.stato,
    };
    const specifica = await updateSpecifica(specificaId, changes);
    void logOperation(session.name, "UPDATE", "commessa_specifica", specificaId, { commessaId: id, ...changes });
    revalidatePath(`/commesse/${id}`);
    return NextResponse.json(specifica);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore aggiornamento specifica" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !COMMESSA_CONTENUTO_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id, specificaId } = await params;
    const s = await carica(id, specificaId);
    if (!s) return NextResponse.json({ error: "Specifica non trovata" }, { status: 404 });
    await deleteSpecifica(specificaId);
    void logOperation(session.name, "DELETE", "commessa_specifica", specificaId, { commessaId: id, tipo: s.tipo, titolo: s.titolo });
    revalidatePath(`/commesse/${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore eliminazione specifica" }, { status: 500 });
  }
}
