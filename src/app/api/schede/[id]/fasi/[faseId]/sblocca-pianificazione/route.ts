import { NextRequest, NextResponse } from "next/server";
import { sbloccaPianificazione, getFasiPerScheda } from "@/lib/schedeFasiRepository";
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
    const cambiato = await sbloccaPianificazione(faseId);
    if (cambiato) {
      void logOperation(session.name, "UPDATE", "scheda", id, { azione: "sblocca_pianificazione_fase_aps", faseId });
      void ricalcolaPiano();
    }
    const fasi = await getFasiPerScheda(id);
    return NextResponse.json(fasi);
  } catch (e) {
    console.error("[schede/[id]/fasi/[faseId]/sblocca-pianificazione POST]", e);
    return NextResponse.json({ error: "Errore nello sblocco della pianificazione" }, { status: 500 });
  }
}
