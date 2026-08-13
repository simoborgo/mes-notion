import { NextRequest, NextResponse } from "next/server";
import { getCarichiByCommessa } from "@/lib/carichiRepository";
import { getSchedeByCommessa } from "@/lib/schedeRepository";
import { getCommessaById, updateCommessa } from "@/lib/commesseRepository";
import { getAreeByCommessa } from "@/lib/areeRepository";
import { getSessionFromRequest, COMMESSE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [commessa, aree, schede, carichi] = await Promise.all([
      getCommessaById(id),
      getAreeByCommessa(id),
      getSchedeByCommessa(id),
      getCarichiByCommessa(id),
    ]);
    return NextResponse.json({ commessa, aree, schede, carichi });
  } catch (e) {
    console.error("API commesse/[id] error:", e);
    return NextResponse.json({ error: "Non trovato", detail: String(e) }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !COMMESSE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const commessa = await updateCommessa(id, {
      numeroCommessa: typeof body.numeroCommessa === "string" ? body.numeroCommessa.trim() : undefined,
      cliente: typeof body.cliente === "string" ? body.cliente.trim() : undefined,
      localita: typeof body.localita === "string" ? body.localita.trim() : undefined,
      info: typeof body.info === "string" ? body.info.trim() : undefined,
      responsabile: typeof body.responsabile === "string" ? body.responsabile.trim() : undefined,
      stato: typeof body.stato === "string" ? body.stato : undefined,
      dataCarico: body.dataCarico !== undefined ? (body.dataCarico || null) : undefined,
      inizioMontaggio: body.inizioMontaggio !== undefined ? (body.inizioMontaggio || null) : undefined,
      fineMontaggio: body.fineMontaggio !== undefined ? (body.fineMontaggio || null) : undefined,
    });
    void logOperation(session.name, "UPDATE", "commessa", id, body as Record<string, unknown>);
    return NextResponse.json(commessa);
  } catch (e) {
    console.error("[commesse/[id] PATCH]", e);
    return NextResponse.json({ error: "Errore aggiornamento commessa" }, { status: 500 });
  }
}
