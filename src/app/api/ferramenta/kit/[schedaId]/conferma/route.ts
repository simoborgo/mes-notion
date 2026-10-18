import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updateSchedaKitFerramenta, getSchedaById } from "@/lib/schedeRepository";
import { getDistintaKitByOdp } from "@/lib/kitFerramentaRepository";
import { sendNotifica } from "@/lib/notify";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";
import { getPublicBaseUrl } from "@/lib/url";
import { pool } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ schedaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { schedaId } = await params;
  const [righe, scheda] = await Promise.all([getDistintaKitByOdp(schedaId), getSchedaById(schedaId)]);
  if (righe.length === 0) {
    return NextResponse.json({ error: "Aggiungi almeno una riga alla distinta prima di confermare" }, { status: 400 });
  }

  // Riconferma dopo modifica: esiste già un kit_pronto inviato per questo ODP
  // (dopo l'eliminazione del foglio il kit viene ricostruito e riconfermato).
  const { rows: precedenti } = await pool.query(
    `SELECT 1 FROM notifiche_inviate WHERE entity_type='scheda' AND entity_id=$1 AND event_type='kit_pronto' AND esito='inviata' LIMIT 1`,
    [schedaId]
  );
  const aggiornamento = precedenti.length > 0;

  const updated = await updateSchedaKitFerramenta(schedaId, "Si");

  const result = await sendNotifica({
    entityType: "scheda",
    entityId: schedaId,
    eventType: "kit_pronto",
    eventId: crypto.randomUUID(),
    webhookUrl: process.env.N8N_WEBHOOK_FERRAMENTA,
    payload: {
      evento: "kit_pronto",
      tipo_kit: "odp",
      aggiornamento,
      odp: scheda.odp,
      numero_scheda: scheda.numeroScheda,
      righe: righe.length,
      pdf_url: `${getPublicBaseUrl(req)}/api/ferramenta/kit/${schedaId}/pdf`,
    },
  });

  void logOperation(session.name, "UPDATE", "kit_ferramenta", schedaId, { stato: "Si", righe: righe.length });
  revalidatePath("/admin/ferramenta/kit");
  revalidatePath("/ferramenta/fogli-scarico");

  if (result.warning) {
    return NextResponse.json({ ok: true, scheda: updated, warnings: [result.warning] }, { status: 207 });
  }
  return NextResponse.json({ ok: true, scheda: updated });
}
