import { NextRequest, NextResponse } from "next/server";
import { getBordoById, updateBordo, disattivaBordo } from "@/lib/bordiRepository";
import { getSessionFromRequest, MAGAZZINO_BORDI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bordo = await getBordoById(id);
    return NextResponse.json(bordo);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

// codiceInventario non è modificabile qui di proposito: si scrive solo in creazione (POST),
// stesso pattern di Vernici.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !MAGAZZINO_BORDI_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();

    const bordo = await updateBordo(id, {
      codice: body.codice,
      decorCodice: body.decorCodice,
      decorNome: body.decorNome,
      materiale: body.materiale,
      spessoreMm: body.spessoreMm,
      altezzaMm: body.altezzaMm,
      finitura: body.finitura,
      fornitore: body.fornitore,
      codiceFornitore: body.codiceFornitore,
      unitaMisura: body.unitaMisura,
      clienteRiferimento: body.clienteRiferimento,
      attivo: body.attivo,
      updatedBy: session.username,
    });

    void logOperation(session.name, "UPDATE", "bordo", id, body);
    return NextResponse.json(bordo);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[PATCH /api/magazzino/bordi]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !MAGAZZINO_BORDI_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;

    await disattivaBordo(id);
    void logOperation(session.name, "DELETE", "bordo", id, {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/magazzino/bordi]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
