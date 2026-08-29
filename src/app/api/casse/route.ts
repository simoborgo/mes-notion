import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCasse, createCassa } from "@/lib/casseRepository";
import { getSessionFromRequest, WRITE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET() {
  try {
    const casse = await getCasse();
    return NextResponse.json(casse);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero casse" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !WRITE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const body = await req.json();
    const { commessaId, descrizione, note, schede } = body;
    if (!commessaId) {
      return NextResponse.json({ error: "Commessa obbligatoria" }, { status: 400 });
    }

    const cassa = await createCassa({
      commessaId,
      descrizione: descrizione?.trim() || undefined,
      note: note?.trim() || undefined,
      schede: Array.isArray(schede) ? schede : [],
    });

    void logOperation(session.name, "CREATE", "cassa", cassa.id, { commessaId, descrizione });

    revalidatePath("/casse");

    return NextResponse.json(cassa, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore creazione cassa" }, { status: 500 });
  }
}
