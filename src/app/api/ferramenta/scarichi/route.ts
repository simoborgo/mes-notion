import { NextRequest, NextResponse } from "next/server";
import { creaScarico, getScarichi, type StatoScarico } from "@/lib/scaricoRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const STATI_VALIDI: StatoScarico[] = ["aperta", "chiusa", "annullata"];

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const statoParam = searchParams.get("stato");
  const stato = statoParam && STATI_VALIDI.includes(statoParam as StatoScarico) ? (statoParam as StatoScarico) : undefined;
  try {
    const scarichi = await getScarichi(stato);
    return NextResponse.json(scarichi);
  } catch (e) {
    console.error("[scarichi GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const odpId = typeof body.odpId === "string" && body.odpId ? body.odpId : null;
  const odpLabel = typeof body.odpLabel === "string" && body.odpLabel ? body.odpLabel : null;
  try {
    const scarico = await creaScarico({ odpId, odpLabel, apertaDa: session.name });
    void logOperation(session.name, "CREATE", "scarico", scarico.id, { odpId, odpLabel });
    return NextResponse.json(scarico);
  } catch (e) {
    console.error("[scarichi POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
