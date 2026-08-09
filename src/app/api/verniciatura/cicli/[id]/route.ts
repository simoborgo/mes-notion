import { NextRequest, NextResponse } from "next/server";
import { getCicloById, updateCiclo, disattivaCiclo } from "@/lib/cicliVerniciaturaRepository";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ciclo = await getCicloById(id);
    return NextResponse.json(ciclo);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

// nome/note sono sempre modificabili, anche a ciclo validato (non fanno parte della "ricetta").
// Per modificare fasi/prodotti va usato genera-figlio se il ciclo è già validato.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();

    const ciclo = await updateCiclo(id, { nome: body.nome, note: body.note });
    void logOperation(session.name, "UPDATE", "ciclo_verniciatura", id, body);
    return NextResponse.json(ciclo);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[PATCH /api/verniciatura/cicli]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;

    await disattivaCiclo(id);
    void logOperation(session.name, "DELETE", "ciclo_verniciatura", id, {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/verniciatura/cicli]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
