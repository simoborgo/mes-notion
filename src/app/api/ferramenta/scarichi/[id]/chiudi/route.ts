import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { chiudiScarico } from "@/lib/scaricoRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const { warnings } = await chiudiScarico(id, session.name);
    void logOperation(session.name, "UPDATE", "scarico", id, { azione: "chiudi" });
    revalidatePath("/ferramenta");
    revalidatePath("/admin/ferramenta");
    if (warnings.length > 0) {
      return NextResponse.json({ ok: true, warnings }, { status: 207 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[scarichi/[id]/chiudi POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
