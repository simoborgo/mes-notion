import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCarichi, createCarico } from "@/lib/carichiRepository";
import { getSessionFromRequest, WRITE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET() {
  try {
    const carichi = await getCarichi();
    return NextResponse.json(carichi);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero carichi" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !WRITE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const body = await req.json();
    const { titolo, descrizione, dataCarico, commessaId, odpIds, modalita, stato } = body;
    if (!titolo?.trim()) {
      return NextResponse.json({ error: "Titolo obbligatorio" }, { status: 400 });
    }
    if (!dataCarico) {
      return NextResponse.json({ error: "Data Carico obbligatoria" }, { status: 400 });
    }

    const carico = await createCarico({
      titolo: titolo.trim(),
      descrizione: descrizione?.trim() || undefined,
      dataCarico,
      commessaId: commessaId || null,
      odpIds: Array.isArray(odpIds) ? odpIds : [],
      modalita: modalita || undefined,
      stato: stato || undefined,
    });

    void logOperation(session.name, "CREATE", "carico", carico.id, { titolo, dataCarico, commessaId, odpIds, modalita, stato });

    revalidatePath("/carichi");
    if (commessaId) revalidatePath("/commesse");

    return NextResponse.json(carico, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore creazione carico" }, { status: 500 });
  }
}
