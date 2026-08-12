import { NextRequest, NextResponse } from "next/server";
import { creaKitCommessa, getKitCommesse, type StatoKitCommessa } from "@/lib/kitCommessaRepository";
import { getSessionFromRequest, KIT_COMMESSA_CREA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const STATI_VALIDI: StatoKitCommessa[] = ["aperto", "chiuso"];

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !KIT_COMMESSA_CREA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const statoParam = searchParams.get("stato");
  const stato = statoParam && STATI_VALIDI.includes(statoParam as StatoKitCommessa) ? (statoParam as StatoKitCommessa) : undefined;
  try {
    const kit = await getKitCommesse(stato);
    return NextResponse.json(kit);
  } catch (e) {
    console.error("[kit-commessa GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !KIT_COMMESSA_CREA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const commessaId = typeof body.commessaId === "string" ? body.commessaId : "";
  const commessaLabel = typeof body.commessaLabel === "string" && body.commessaLabel ? body.commessaLabel : null;
  if (!commessaId) {
    return NextResponse.json({ error: "Commessa obbligatoria" }, { status: 400 });
  }
  try {
    const kit = await creaKitCommessa({ commessaId, commessaLabel, apertoDa: session.name });
    void logOperation(session.name, "CREATE", "kit_commessa", kit.id, { commessaId, commessaLabel });
    return NextResponse.json(kit);
  } catch (e) {
    console.error("[kit-commessa POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
