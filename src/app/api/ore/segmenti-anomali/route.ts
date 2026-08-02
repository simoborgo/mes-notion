import { NextRequest, NextResponse } from "next/server";
import { getSegmentiAnomali } from "@/lib/segmentiOperatoreRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    const segmenti = await getSegmentiAnomali();
    return NextResponse.json(segmenti);
  } catch (e) {
    console.error("[ore/segmenti-anomali]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
