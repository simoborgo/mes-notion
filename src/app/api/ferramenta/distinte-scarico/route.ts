import { NextRequest, NextResponse } from "next/server";
import { creaDistinta, getDistinte, type StatoDistinta } from "@/lib/distinteScaricoRepository";
import { getSessionFromRequest, DISTINTE_SCARICO_CREA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const STATI_VALIDI: StatoDistinta[] = ["aperta", "chiusa", "annullata"];

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !DISTINTE_SCARICO_CREA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const statoParam = searchParams.get("stato");
  const stato = statoParam && STATI_VALIDI.includes(statoParam as StatoDistinta) ? (statoParam as StatoDistinta) : undefined;
  try {
    const distinte = await getDistinte(stato);
    return NextResponse.json(distinte);
  } catch (e) {
    console.error("[distinte-scarico GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !DISTINTE_SCARICO_CREA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const odpId = typeof body.odpId === "string" && body.odpId ? body.odpId : null;
  const odpLabel = typeof body.odpLabel === "string" && body.odpLabel ? body.odpLabel : null;
  const commessaId = typeof body.commessaId === "string" && body.commessaId ? body.commessaId : null;
  const commessaLabel = typeof body.commessaLabel === "string" && body.commessaLabel ? body.commessaLabel : null;
  try {
    const distinta = await creaDistinta({ odpId, odpLabel, commessaId, commessaLabel, apertaDa: session.name });
    void logOperation(session.name, "CREATE", "distinta_scarico", distinta.id, { odpId, odpLabel, commessaId, commessaLabel });
    return NextResponse.json(distinta);
  } catch (e) {
    console.error("[distinte-scarico POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
