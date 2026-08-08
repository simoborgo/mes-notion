import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { updateOperatorePage } from "@/lib/notion";
import { getSessionFromRequest, PARAMETRI_REPARTO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !PARAMETRI_REPARTO_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const operatore = await updateOperatorePage(id, {
      cognome: typeof body.cognome === "string" ? body.cognome.trim() : undefined,
      nome: typeof body.nome === "string" ? body.nome.trim() : undefined,
      reparto: typeof body.reparto === "string" ? body.reparto.trim() : undefined,
      tipo: typeof body.tipo === "string" ? body.tipo.trim() : undefined,
      azienda: typeof body.azienda === "string" ? body.azienda.trim() : undefined,
      inForza: typeof body.inForza === "boolean" ? body.inForza : undefined,
    });
    revalidateTag("operatori", "max");
    void logOperation(session.name, "UPDATE", "operatore", id, body as Record<string, unknown>);
    return NextResponse.json(operatore);
  } catch (e) {
    console.error("[admin/operatori/[id] PATCH]", e);
    return NextResponse.json({ error: "Errore aggiornamento operatore" }, { status: 500 });
  }
}
