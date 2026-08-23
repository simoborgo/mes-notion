import { NextRequest, NextResponse } from "next/server";
import { pianificaManualmente, getFasiPerScheda } from "@/lib/schedeFasiRepository";
import { ricalcolaPiano } from "@/lib/apsSchedulerRepository";
import { getSessionFromRequest, MODIFICA_SCHEDA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; faseId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MODIFICA_SCHEDA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  try {
    const { id, faseId } = await params;
    const body = await req.json().catch(() => ({}));
    const { dataInizio, dataFine } = body;
    if (typeof dataInizio !== "string" || typeof dataFine !== "string" || dataInizio > dataFine) {
      return NextResponse.json({ error: "Date non valide" }, { status: 400 });
    }

    const risultato = await pianificaManualmente(faseId, dataInizio, dataFine);
    if (risultato.conflitto) {
      return NextResponse.json({ error: "Sovrapposizione con un'altra fase già pianificata manualmente sulla stessa corsia" }, { status: 409 });
    }
    if (risultato.ok) {
      void logOperation(session.name, "UPDATE", "scheda", id, { azione: "pianifica_manuale_fase_aps", faseId, dataInizio, dataFine });
      void ricalcolaPiano();
    }

    const fasi = await getFasiPerScheda(id);
    return NextResponse.json(fasi);
  } catch (e) {
    console.error("[schede/[id]/fasi/[faseId]/pianifica-manuale POST]", e);
    return NextResponse.json({ error: "Errore nella pianificazione manuale" }, { status: 500 });
  }
}
