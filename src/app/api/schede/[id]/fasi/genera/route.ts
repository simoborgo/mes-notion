import { NextRequest, NextResponse } from "next/server";
import { generaFasiPerScheda, getFasiPerScheda } from "@/lib/schedeFasiRepository";
import { getSessionFromRequest, MODIFICA_SCHEDA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MODIFICA_SCHEDA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const patternIdForzato = typeof body.patternId === "string" && body.patternId ? body.patternId : undefined;

    const risultato = await generaFasiPerScheda(id, { patternIdForzato });
    if (!risultato.generato) {
      return NextResponse.json({ error: "Impossibile generare le fasi", motivo: risultato.motivo }, { status: 400 });
    }

    void logOperation(session.name, "UPDATE", "scheda", id, { azione: "genera_fasi_aps", patternIdForzato });

    const fasi = await getFasiPerScheda(id);
    return NextResponse.json(fasi);
  } catch (e) {
    console.error("[schede/[id]/fasi/genera POST]", e);
    return NextResponse.json({ error: "Errore nella generazione fasi" }, { status: 500 });
  }
}
