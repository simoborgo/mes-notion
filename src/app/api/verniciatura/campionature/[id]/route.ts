import { NextRequest, NextResponse } from "next/server";
import { getCampionaturaById, updateCampionatura, disattivaCampionatura } from "@/lib/campionatureVerniciaturaRepository";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const campionatura = await getCampionaturaById(id);
    return NextResponse.json(campionatura);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();

    const campionatura = await updateCampionatura(id, {
      codiceCampioneMaterialista: body.codiceCampioneMaterialista,
      dataCampionatura: body.dataCampionatura,
      note: body.note,
    });
    void logOperation(session.name, "UPDATE", "campionatura_verniciatura", id, body);
    return NextResponse.json(campionatura);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[PATCH /api/verniciatura/campionature]", message);
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

    await disattivaCampionatura(id);
    void logOperation(session.name, "DELETE", "campionatura_verniciatura", id, {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/verniciatura/campionature]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
