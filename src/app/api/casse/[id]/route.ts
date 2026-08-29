import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updateCassa, deleteCassa } from "@/lib/casseRepository";
import type { CassaUpdate } from "@/lib/types";
import { getSessionFromRequest, WRITE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let body: CassaUpdate | undefined;
  try {
    const { id } = await params;
    const session = await getSessionFromRequest(req);
    if (!session || !WRITE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    body = await req.json();

    const updated = await updateCassa(id, body!);

    void logOperation(session.name, "UPDATE", "cassa", id, body as Record<string, unknown>);

    revalidatePath("/casse");

    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[PATCH /api/casse] ERROR:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSessionFromRequest(req);
    if (!session || !WRITE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }

    await deleteCassa(id);

    void logOperation(session.name, "DELETE", "cassa", id, {});

    revalidatePath("/casse");

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/casse] ERROR:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
