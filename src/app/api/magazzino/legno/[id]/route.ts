import { NextRequest, NextResponse } from "next/server";
import { getLegnoById, updateLegno, disattivaLegno } from "@/lib/legnoRepository";
import { getSessionFromRequest, MAGAZZINO_LEGNO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const legno = await getLegnoById(id);
    return NextResponse.json(legno);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !MAGAZZINO_LEGNO_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();

    const legno = await updateLegno(id, {
      codice: body.codice,
      essenza: body.essenza,
      qualita: body.qualita,
      spessoreMm: body.spessoreMm,
      larghezzaMm: body.larghezzaMm,
      lunghezzaMm: body.lunghezzaMm,
      fornitore: body.fornitore,
      codiceFornitore: body.codiceFornitore,
      unitaMisura: body.unitaMisura,
      clienteRiferimento: body.clienteRiferimento,
      attivo: body.attivo,
      updatedBy: session.username,
    });

    void logOperation(session.name, "UPDATE", "legno", id, body);
    return NextResponse.json(legno);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[PATCH /api/magazzino/legno]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !MAGAZZINO_LEGNO_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;

    await disattivaLegno(id);
    void logOperation(session.name, "DELETE", "legno", id, {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/magazzino/legno]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
