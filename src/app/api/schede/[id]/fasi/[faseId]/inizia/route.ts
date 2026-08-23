import { NextRequest, NextResponse } from "next/server";
import { iniziaFase, getFasiPerScheda } from "@/lib/schedeFasiRepository";
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
    const cambiato = await iniziaFase(faseId);
    if (cambiato) {
      void logOperation(session.name, "UPDATE", "scheda", id, { azione: "inizia_fase_aps", faseId });
      void ricalcolaPiano();
    }
    const fasi = await getFasiPerScheda(id);
    return NextResponse.json(fasi);
  } catch (e) {
    console.error("[schede/[id]/fasi/[faseId]/inizia POST]", e);
    return NextResponse.json({ error: "Errore nell'avvio della fase" }, { status: 500 });
  }
}
