import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updateSchedaKitFerramenta, getSchedaById } from "@/lib/schedeRepository";
import { deleteDistintaKitByOdp, getDistintaKitConStato } from "@/lib/kitFerramentaRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";
import { sendNotifica } from "@/lib/notify";

// Usata dalla tab "Kit Ferramenta" dentro il dettaglio Scheda (client-side, fetch on demand) —
// la pagina admin/ferramenta/kit/[schedaId] invece legge le righe direttamente server-side.
export async function GET(req: NextRequest, { params }: { params: Promise<{ schedaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { schedaId } = await params;
  const righe = await getDistintaKitConStato(schedaId);
  return NextResponse.json(righe);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ schedaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { schedaId } = await params;
  let body: { stato?: "Si" | "No" | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  if (body.stato !== "Si" && body.stato !== "No" && body.stato !== null) {
    return NextResponse.json({ error: "Stato non valido" }, { status: 400 });
  }

  const updated = await updateSchedaKitFerramenta(schedaId, body.stato ?? null);
  void logOperation(session.name, "UPDATE", "kit_ferramenta", schedaId, { stato: body.stato });
  revalidatePath("/admin/ferramenta/kit");
  revalidatePath("/ferramenta/fogli-scarico");
  return NextResponse.json(updated);
}

// Elimina l'intero "foglio di scarico" (kit) di un ODP: azzera lo stato Kit Ferramenta su
// Notion e cancella tutte le righe della distinta su Postgres — richiesto dalla pagina Kit
// Ferramenta ODP per gli ODP con kit già confermato (Sì), che altrimenti restava bloccato in
// sola lettura senza modo di tornare indietro.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ schedaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { schedaId } = await params;
  const schedaPrima = await getSchedaById(schedaId);
  await deleteDistintaKitByOdp(schedaId);
  const updated = await updateSchedaKitFerramenta(schedaId, null);

  // Avvisa il magazziniere solo se il kit era già stato confermato (e quindi notificato).
  if (schedaPrima.kitFerramenta === "Si") {
    const result = await sendNotifica({
      entityType: "scheda",
      entityId: schedaId,
      eventType: "kit_annullato",
      eventId: crypto.randomUUID(),
      webhookUrl: process.env.N8N_WEBHOOK_FERRAMENTA,
      payload: {
        evento: "kit_annullato",
        tipo_kit: "odp",
        odp: schedaPrima.odp,
        numero_scheda: schedaPrima.numeroScheda,
      },
    });
    if (result.warning) console.warn("[kit DELETE] notifica kit_annullato:", result.warning);
  }
  void logOperation(session.name, "DELETE", "kit_ferramenta", schedaId, { azione: "elimina-foglio-scarico" });
  revalidatePath("/admin/ferramenta/kit");
  revalidatePath("/ferramenta/fogli-scarico");
  return NextResponse.json(updated);
}
