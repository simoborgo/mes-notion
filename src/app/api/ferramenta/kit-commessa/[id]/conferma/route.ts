import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { confermaKit, getKitCommessaById, getRigheByKit } from "@/lib/kitCommessaRepository";
import { sendNotifica } from "@/lib/notify";
import { getSessionFromRequest, KIT_COMMESSA_CREA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";
import { getPublicBaseUrl } from "@/lib/url";

// Stessa logica del Kit Ferramenta ODP (kit/[schedaId]/conferma): segna "pronto" e notifica il
// magazziniere — eventId = id del kit, quindi riconfermare non genera mai una notifica doppia.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !KIT_COMMESSA_CREA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  const [kitEsistente, righe] = await Promise.all([getKitCommessaById(id), getRigheByKit(id)]);
  if (!kitEsistente) return NextResponse.json({ error: "Kit Commessa non trovato" }, { status: 404 });
  if (righe.length === 0) {
    return NextResponse.json({ error: "Aggiungi almeno una riga prima di confermare" }, { status: 400 });
  }

  try {
    const kit = await confermaKit(id);
    const result = await sendNotifica({
      entityType: "kit_commessa",
      entityId: id,
      eventType: "kit_pronto",
      eventId: id,
      webhookUrl: process.env.N8N_WEBHOOK_FERRAMENTA,
      payload: {
        titolo: kit.commessaLabel || kit.commessaId,
        righe: righe.length,
        url: `${getPublicBaseUrl(req)}/ferramenta/kit-commessa/${id}`,
      },
    });

    void logOperation(session.name, "UPDATE", "kit_commessa", id, { azione: "conferma", righe: righe.length });
    revalidatePath("/ferramenta/kit-commessa");
    revalidatePath(`/ferramenta/kit-commessa/${id}`);

    if (result.warning) return NextResponse.json({ ok: true, kit, warnings: [result.warning] }, { status: 207 });
    return NextResponse.json({ ok: true, kit });
  } catch (e) {
    console.error("[kit-commessa/[id]/conferma POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
