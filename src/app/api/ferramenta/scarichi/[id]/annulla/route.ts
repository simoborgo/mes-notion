import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { annullaScarico } from "@/lib/scaricoRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const scarico = await annullaScarico(id);
    void logOperation(session.name, "UPDATE", "scarico", id, { azione: "annulla" });
    revalidatePath("/ferramenta/scarichi");
    revalidatePath(`/ferramenta/scarichi/${id}`);
    return NextResponse.json(scarico);
  } catch (e) {
    console.error("[scarichi/[id]/annulla POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
