import { NextRequest, NextResponse } from "next/server";
import { rimuoviDaCodaManualeCnc, getFasiPerScheda } from "@/lib/schedeFasiRepository";
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
    const cambiato = await rimuoviDaCodaManualeCnc(faseId);
    if (cambiato) {
      void logOperation(session.name, "UPDATE", "scheda", id, { azione: "rimuovi_coda_manuale_cnc", faseId });
      void ricalcolaPiano();
    }
    const fasi = await getFasiPerScheda(id);
    return NextResponse.json(fasi);
  } catch (e) {
    console.error("[schede/[id]/fasi/[faseId]/rimuovi-coda-manuale-cnc POST]", e);
    return NextResponse.json({ error: "Errore nella rimozione dalla coda manuale" }, { status: 500 });
  }
}
