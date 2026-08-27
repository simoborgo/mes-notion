import { NextRequest, NextResponse } from "next/server";
import { getTranciatoById, updateTranciato, disattivaTranciato } from "@/lib/tranciatiRepository";
import { getSessionFromRequest, MAGAZZINO_TRANCIATI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tranciato = await getTranciatoById(id);
    return NextResponse.json(tranciato);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !MAGAZZINO_TRANCIATI_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();

    const tranciato = await updateTranciato(id, {
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

    void logOperation(session.name, "UPDATE", "tranciato", id, body);
    return NextResponse.json(tranciato);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[PATCH /api/magazzino/tranciati]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !MAGAZZINO_TRANCIATI_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;

    await disattivaTranciato(id);
    void logOperation(session.name, "DELETE", "tranciato", id, {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/magazzino/tranciati]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
