import { NextRequest, NextResponse } from "next/server";
import { updateFornitore } from "@/lib/fornitoriRepository";
import { getSessionFromRequest, IMPOSTAZIONI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !IMPOSTAZIONI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const fornitore = await updateFornitore(id, {
      nome: typeof body.nome === "string" ? body.nome.trim() : undefined,
      codiceOs1: typeof body.codiceOs1 === "string" ? body.codiceOs1.trim() : undefined,
      email: typeof body.email === "string" ? (body.email.trim() || null) : undefined,
    });
    void logOperation(session.name, "UPDATE", "fornitore", id, body as Record<string, unknown>);
    return NextResponse.json(fornitore);
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Codice OS1 già assegnato a un altro fornitore" }, { status: 409 });
    }
    console.error("[admin/fornitori/[id] PATCH]", e);
    return NextResponse.json({ error: "Errore aggiornamento fornitore" }, { status: 500 });
  }
}
