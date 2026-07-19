import { NextRequest, NextResponse } from "next/server";
import { repo, SCHEDA_REGEX } from "@/lib/verificheServices";
import { getSessionFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ scheda: string }> }) {
  const { scheda } = await params;
  if (!SCHEDA_REGEX.test(scheda)) {
    return NextResponse.json({ ok: false, error: "Formato scheda non valido" }, { status: 400 });
  }
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "Non autenticato" }, { status: 401 });

  try {
    const log = await repo.getLog(scheda);
    return NextResponse.json({ ok: true, log });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
