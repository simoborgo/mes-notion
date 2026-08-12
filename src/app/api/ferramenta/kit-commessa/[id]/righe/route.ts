import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { aggiungiRigaKit } from "@/lib/kitCommessaRepository";
import { getSessionFromRequest, KIT_COMMESSA_CREA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !KIT_COMMESSA_CREA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const articoloId = typeof body.articoloId === "string" && body.articoloId ? body.articoloId : null;
  const descrizione = typeof body.descrizione === "string" && body.descrizione.trim() ? body.descrizione.trim() : null;
  const quantita = Number(body.quantita);
  if (!articoloId && !descrizione) {
    return NextResponse.json({ error: "Seleziona un articolo o scrivi una descrizione" }, { status: 400 });
  }
  if (!(quantita > 0)) {
    return NextResponse.json({ error: "Quantità obbligatoria (> 0)" }, { status: 400 });
  }
  try {
    const riga = await aggiungiRigaKit({ kitCommessaId: id, articoloId, descrizione, quantita });
    void logOperation(session.name, "CREATE", "kit_commessa", id, { articoloId, descrizione, quantita });
    revalidatePath(`/ferramenta/kit-commessa/${id}`);
    return NextResponse.json(riga);
  } catch (e) {
    console.error("[kit-commessa/[id]/righe POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
