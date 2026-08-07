import { NextRequest, NextResponse } from "next/server";
import { salvaStimaRepartoOfferta } from "@/lib/offerteRepository";
import { getSessionFromRequest, OFFERTE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !OFFERTE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const righe = Array.isArray(body.righe) ? body.righe : null;
  if (!righe) {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  const parsed = righe.map((r: { reparto?: unknown; percentuale?: unknown }) => ({
    reparto: typeof r.reparto === "string" ? r.reparto : "",
    percentuale: Number(r.percentuale),
  }));
  if (parsed.some((r: { reparto: string; percentuale: number }) => !r.reparto || !(r.percentuale >= 0))) {
    return NextResponse.json({ error: "Righe non valide" }, { status: 400 });
  }

  try {
    await salvaStimaRepartoOfferta(id, parsed);
    void logOperation(session.name, "UPDATE", "offerta", id, { azione: "stima-reparto", righe: parsed });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[offerte/[id]/stima-reparto PUT]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
