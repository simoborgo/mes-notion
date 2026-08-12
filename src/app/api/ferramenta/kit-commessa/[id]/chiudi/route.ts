import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { chiudiKit } from "@/lib/kitCommessaRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Solo FERRAMENTA_ROLES: la chiusura è del magazziniere, non dell'Ufficio Tecnico. Non fa
// scarico massivo — lo scarico è già avvenuto riga per riga via spunta/route.ts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const kit = await chiudiKit(id, session.name);
    void logOperation(session.name, "UPDATE", "kit_commessa", id, { azione: "chiudi" });
    revalidatePath("/ferramenta/kit-commessa");
    revalidatePath(`/ferramenta/kit-commessa/${id}`);
    return NextResponse.json(kit);
  } catch (e) {
    console.error("[kit-commessa/[id]/chiudi POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
