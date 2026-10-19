import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getGiroById, updateGiro, deleteGiro } from "@/lib/giriRepository";
import type { GiroInput } from "@/lib/types";
import { getSessionFromRequest, MODIFICA_SCHEDA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; giroId: string }> };

// Il giro deve appartenere alla scheda dell'URL: evita di modificare il giro di un'altra scheda
// conoscendone solo l'id.
async function giroDellaScheda(schedaId: string, giroId: string) {
  const giro = await getGiroById(giroId).catch(() => null);
  return giro && giro.schedaId === schedaId ? giro : null;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getSessionFromRequest(req);
  if (!session || !MODIFICA_SCHEDA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  try {
    const { id, giroId } = await params;
    if (!(await giroDellaScheda(id, giroId))) return NextResponse.json({ error: "Giro non trovato" }, { status: 404 });
    const body: GiroInput = await req.json();
    const giro = await updateGiro(giroId, body);
    revalidatePath("/schede");
    void logOperation(session.name, "UPDATE", "scheda_giro", giroId, body as Record<string, unknown>);
    return NextResponse.json(giro);
  } catch (e) {
    console.error("[PATCH /api/schede/[id]/giri/[giroId]]", e);
    return NextResponse.json({ error: "Errore aggiornamento giro" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await getSessionFromRequest(req);
  if (!session || !MODIFICA_SCHEDA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  try {
    const { id, giroId } = await params;
    if (!(await giroDellaScheda(id, giroId))) return NextResponse.json({ error: "Giro non trovato" }, { status: 404 });
    await deleteGiro(giroId);
    revalidatePath("/schede");
    void logOperation(session.name, "DELETE", "scheda_giro", giroId, { schedaId: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/schede/[id]/giri/[giroId]]", e);
    return NextResponse.json({ error: "Errore eliminazione giro" }, { status: 500 });
  }
}
