import { NextRequest, NextResponse } from "next/server";
import { createFornitore } from "@/lib/fornitoriRepository";
import { getSessionFromRequest, IMPOSTAZIONI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !IMPOSTAZIONI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!nome) {
    return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
  }

  try {
    const fornitore = await createFornitore({
      nome,
      codiceOs1: typeof body.codiceOs1 === "string" ? body.codiceOs1.trim() : "",
      email: typeof body.email === "string" && body.email.trim() ? body.email.trim() : null,
    });
    void logOperation(session.name, "CREATE", "fornitore", fornitore.id, body as Record<string, unknown>);
    return NextResponse.json(fornitore);
  } catch (e) {
    // 23505: unique_violation, quasi certamente su codice_os1 (già usato da un altro fornitore)
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Codice OS1 già assegnato a un altro fornitore" }, { status: 409 });
    }
    console.error("[admin/fornitori POST]", e);
    return NextResponse.json({ error: "Errore creazione fornitore" }, { status: 500 });
  }
}
