import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionFromRequest } from "@/lib/auth";
import { getSchedaById, updateSchedaStato } from "@/lib/notion";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });

    const { id: rilavorazioneId } = await params;

    const rilavorazione = await getSchedaById(rilavorazioneId);
    if (rilavorazione.tipologia !== "Rilavorazione") {
      return NextResponse.json({ ok: false, error: "La scheda non è una rilavorazione" }, { status: 400 });
    }

    // Completa la rilavorazione
    await updateSchedaStato(rilavorazioneId, "Completato");

    // Sblocca il parent (torna in lavorazione interna)
    if (rilavorazione.parentId) {
      await updateSchedaStato(rilavorazione.parentId, "In Lavorazione");
    }

    revalidatePath("/schede");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[rientro-rilavorazione]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message ?? "Errore interno" }, { status: 500 });
  }
}
