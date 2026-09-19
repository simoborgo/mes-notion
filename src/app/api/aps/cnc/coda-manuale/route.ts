import { NextRequest, NextResponse } from "next/server";
import { impostaCodaManualeCnc } from "@/lib/schedeFasiRepository";
import { ricalcolaPiano } from "@/lib/apsSchedulerRepository";
import { getSessionFromRequest, MODIFICA_SCHEDA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Fase 9b — riordina/assegna l'intera coda manuale di una corsia CNC (Vista CNC
// "Programmazione"): riceve sempre l'ordine desiderato completo, mai un singolo spostamento.
// Le date non vengono calcolate qui — solo il prossimo ricalcolo (pianificaCorsie) le determina
// dalle ore stimate, rispettando l'ordine appena fissato.
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !MODIFICA_SCHEDA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const { corsia, faseIds } = body;
    if (typeof corsia !== "number" || corsia < 0 || !Array.isArray(faseIds) || !faseIds.every((f) => typeof f === "string")) {
      return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });
    }
    await impostaCodaManualeCnc(corsia, faseIds);
    void logOperation(session.name, "UPDATE", "reparto", "cnc-coda-manuale", { azione: "imposta_coda_manuale_cnc", corsia, faseIds });
    void ricalcolaPiano();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[aps/cnc/coda-manuale POST]", e);
    return NextResponse.json({ error: "Errore nell'aggiornamento della coda" }, { status: 500 });
  }
}
