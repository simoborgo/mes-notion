import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { setStatoApprovvigionamentoRiga } from "@/lib/kitFerramentaRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";
import type { StatoApprovvigionamentoKit } from "@/lib/types";

const STATI: StatoApprovvigionamentoKit[] = ["ordinato", "consegna_parziale", "attesa_fornitore"];

// Il magazziniere segnala perché un componente del kit non è ancora pronto (null = azzera).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ schedaId: string; rigaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { schedaId, rigaId } = await params;
  let body: { stato?: string | null; inArrivoIl?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  const stato = body.stato ?? null;
  if (stato !== null && !STATI.includes(stato as StatoApprovvigionamentoKit)) {
    return NextResponse.json({ error: "Stato non valido" }, { status: 400 });
  }
  const inArrivoIl = body.inArrivoIl || null;
  if (stato === "ordinato" && !(inArrivoIl && /^\d{4}-\d{2}-\d{2}$/.test(inArrivoIl))) {
    return NextResponse.json({ error: "Indica la data di arrivo prevista" }, { status: 400 });
  }

  try {
    const riga = await setStatoApprovvigionamentoRiga(rigaId, stato as StatoApprovvigionamentoKit | null, inArrivoIl);
    void logOperation(session.name, "UPDATE", "kit_ferramenta", schedaId, { rigaId, statoApprovvigionamento: stato, inArrivoIl });
    revalidatePath(`/ferramenta/fogli-scarico/${schedaId}`);
    return NextResponse.json(riga);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore" }, { status: 400 });
  }
}
