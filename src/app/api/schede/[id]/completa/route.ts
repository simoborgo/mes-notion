import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionFromRequest, SPEDIZIONI_ROLES } from "@/lib/auth";
import { updateSchedaStato } from "@/lib/schedeRepository";

// Bottone "Completato e messo in cassa" nella pagina Spedizioni Merci — chiude il ciclo
// Materiale Pronto -> Verificato (automatico da finalize/force-verify) -> Completato (qui,
// manuale). L'organizzazione fisica in casse avviene dopo, nella Packing List (/casse):
// questa route fa solo il flip di stato, nessuna assegnazione a una cassa.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !SPEDIZIONI_ROLES.includes(session.role)) {
      return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    await updateSchedaStato(id, "Completato");

    revalidatePath("/spedizioni");
    revalidatePath("/schede");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[schede/completa]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message ?? "Errore interno" }, { status: 500 });
  }
}
