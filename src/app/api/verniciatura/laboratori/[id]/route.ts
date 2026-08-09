import { NextRequest, NextResponse } from "next/server";
import { updateLaboratorio, disattivaLaboratorio } from "@/lib/laboratoriRepository";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();

    const laboratorio = await updateLaboratorio(id, {
      nome: body.nome !== undefined ? String(body.nome).trim() : undefined,
      note: body.note,
      attivo: body.attivo,
    });

    void logOperation(session.name, "UPDATE", "laboratorio_verniciatura", id, body);
    return NextResponse.json(laboratorio);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[PATCH /api/verniciatura/laboratori]", message);
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

    await disattivaLaboratorio(id);
    void logOperation(session.name, "DELETE", "laboratorio_verniciatura", id, {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/verniciatura/laboratori]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
