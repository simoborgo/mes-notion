import { NextRequest, NextResponse } from "next/server";
import { getArticoloElettricoById, updateArticoloElettrico, disattivaArticoloElettrico } from "@/lib/materialeElettricoRepository";
import { getSessionFromRequest, MAGAZZINO_MATERIALE_ELETTRICO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const articolo = await getArticoloElettricoById(id);
    return NextResponse.json(articolo);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !MAGAZZINO_MATERIALE_ELETTRICO_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();

    const articolo = await updateArticoloElettrico(id, {
      codice: body.codice,
      tipoArticolo: body.tipoArticolo,
      marca: body.marca,
      caratteristiche: body.caratteristiche,
      descrizione: body.descrizione,
      colore: body.colore,
      fornitore: body.fornitore,
      codiceFornitore: body.codiceFornitore,
      unitaMisura: body.unitaMisura,
      clienteRiferimento: body.clienteRiferimento,
      attivo: body.attivo,
      updatedBy: session.username,
    });

    void logOperation(session.name, "UPDATE", "articolo_elettrico", id, body);
    return NextResponse.json(articolo);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[PATCH /api/magazzino/materiale-elettrico]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !MAGAZZINO_MATERIALE_ELETTRICO_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;

    await disattivaArticoloElettrico(id);
    void logOperation(session.name, "DELETE", "articolo_elettrico", id, {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/magazzino/materiale-elettrico]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
