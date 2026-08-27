import { NextRequest, NextResponse } from "next/server";
import { getProfiloMetallicoById, updateProfiloMetallico, disattivaProfiloMetallico } from "@/lib/profiliMetalliciRepository";
import { getSessionFromRequest, MAGAZZINO_PROFILI_METALLICI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profilo = await getProfiloMetallicoById(id);
    return NextResponse.json(profilo);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !MAGAZZINO_PROFILI_METALLICI_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();

    const profilo = await updateProfiloMetallico(id, {
      codice: body.codice,
      tipoProfilo: body.tipoProfilo,
      materiale: body.materiale,
      sezione: body.sezione,
      lunghezzaMm: body.lunghezzaMm,
      finitura: body.finitura,
      colore: body.colore,
      fornitore: body.fornitore,
      codiceFornitore: body.codiceFornitore,
      unitaMisura: body.unitaMisura,
      clienteRiferimento: body.clienteRiferimento,
      attivo: body.attivo,
      updatedBy: session.username,
    });

    void logOperation(session.name, "UPDATE", "profilo_metallico", id, body);
    return NextResponse.json(profilo);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[PATCH /api/magazzino/profili-metallici]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !MAGAZZINO_PROFILI_METALLICI_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;

    await disattivaProfiloMetallico(id);
    void logOperation(session.name, "DELETE", "profilo_metallico", id, {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/magazzino/profili-metallici]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
