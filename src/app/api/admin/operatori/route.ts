import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createOperatorePage } from "@/lib/notion";
import { getSessionFromRequest, PARAMETRI_REPARTO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !PARAMETRI_REPARTO_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const cognome = typeof body.cognome === "string" ? body.cognome.trim() : "";
  if (!cognome) {
    return NextResponse.json({ error: "Cognome obbligatorio" }, { status: 400 });
  }

  try {
    const operatore = await createOperatorePage({
      cognome,
      nome: typeof body.nome === "string" ? body.nome.trim() : "",
      reparto: typeof body.reparto === "string" ? body.reparto.trim() : "",
      tipo: typeof body.tipo === "string" ? body.tipo.trim() : "",
      azienda: typeof body.azienda === "string" ? body.azienda.trim() : "",
      inForza: body.inForza ?? true,
    });
    revalidateTag("operatori", "max");
    void logOperation(session.name, "CREATE", "operatore", operatore.id, body as Record<string, unknown>);
    return NextResponse.json(operatore);
  } catch (e) {
    console.error("[admin/operatori POST]", e);
    return NextResponse.json({ error: "Errore creazione operatore" }, { status: 500 });
  }
}
