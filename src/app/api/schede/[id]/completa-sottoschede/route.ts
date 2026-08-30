import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionFromRequest } from "@/lib/auth";
import { completaSottoschedeAperte } from "@/lib/schedeRepository";
import { logOperation } from "@/lib/audit";

// Bottone "Completa tutte le sottoschede" nella tabella Schede — solo admin: chiude in blocco
// le sottoschede/rilavorazioni ancora aperte di una scheda padre già a "Completato", il caso in
// cui la scheda risulta chiusa in tabella ma trascina dietro sottoschede dimenticate.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const idsAggiornati = await completaSottoschedeAperte(id);

    for (const sottoschedaId of idsAggiornati) {
      void logOperation(session.name, "UPDATE", "scheda", sottoschedaId, { stato: "Completato", motivo: "completa-sottoschede bulk da scheda padre", parentId: id });
    }

    revalidatePath("/schede");
    revalidatePath("/schede/lavorazioni-esterne");

    return NextResponse.json({ ok: true, count: idsAggiornati.length });
  } catch (err) {
    console.error("[schede/completa-sottoschede]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message ?? "Errore interno" }, { status: 500 });
  }
}
