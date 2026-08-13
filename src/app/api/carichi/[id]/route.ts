import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updateCarico, deleteCarico } from "@/lib/carichiRepository";
import type { CaricoUpdate } from "@/lib/types";
import { getSessionFromRequest, WRITE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let body: CaricoUpdate | undefined;
  try {
    const { id } = await params;
    const session = await getSessionFromRequest(req);
    if (!session || !WRITE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    body = await req.json();

    const updated = await updateCarico(id, body!);

    void logOperation(session.name, "UPDATE", "carico", id, body as Record<string, unknown>);

    revalidatePath("/carichi");
    revalidatePath("/commesse");

    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[PATCH /api/carichi] FAILED — payload:", JSON.stringify(body));
    console.error("[PATCH /api/carichi] ERROR:", message);
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

    await deleteCarico(id);

    void logOperation(session.name, "DELETE", "carico", id, {});

    revalidatePath("/carichi");
    revalidatePath("/commesse");

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/carichi] ERROR:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
