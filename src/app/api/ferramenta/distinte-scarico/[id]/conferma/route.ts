import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { confermaDistinta, getDistintaConRighe } from "@/lib/distinteScaricoRepository";
import { sendNotifica } from "@/lib/notify";
import { getSessionFromRequest, DISTINTE_SCARICO_CREA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";
import { getPublicBaseUrl } from "@/lib/url";

// Stessa logica di /api/ferramenta/kit/[schedaId]/conferma, generalizzata a qualunque ambito
// di Distinta di Scarico (Commessa, ODP, libera) — segna "pronta" e notifica il magazziniere,
// indipendentemente dalla chiusura/scarico effettivo (azione separata, vedi chiudi/route.ts).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !DISTINTE_SCARICO_CREA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { id } = await params;
  const risultato = await getDistintaConRighe(id);
  if (!risultato) return NextResponse.json({ error: "Distinta non trovata" }, { status: 404 });
  if (risultato.righe.length === 0) {
    return NextResponse.json({ error: "Aggiungi almeno una riga prima di confermare" }, { status: 400 });
  }

  try {
    const distinta = await confermaDistinta(id);

    // eventId = id distinta: a differenza del Kit ODP (che usa un UUID casuale ad ogni conferma),
    // qui una riconferma non genera una seconda notifica — invio realmente idempotente.
    const result = await sendNotifica({
      entityType: "distinta_scarico",
      entityId: id,
      eventType: "kit_pronto",
      eventId: id,
      webhookUrl: process.env.N8N_WEBHOOK_FERRAMENTA,
      payload: {
        titolo: distinta.odpLabel || distinta.commessaLabel || "Distinta libera",
        righe: risultato.righe.length,
        url: `${getPublicBaseUrl(req)}/ferramenta/distinte-scarico/${id}`,
      },
    });

    void logOperation(session.name, "UPDATE", "distinta_scarico", id, { azione: "conferma", righe: risultato.righe.length });
    revalidatePath("/ferramenta/distinte-scarico");
    revalidatePath(`/ferramenta/distinte-scarico/${id}`);

    if (result.warning) {
      return NextResponse.json({ ok: true, distinta, warnings: [result.warning] }, { status: 207 });
    }
    return NextResponse.json({ ok: true, distinta });
  } catch (e) {
    console.error("[distinte-scarico/[id]/conferma POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
