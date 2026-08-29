import { NextRequest, NextResponse } from "next/server";
import { getPresentiPerData } from "@/lib/oreRepository";
import { isGiornoChiuso } from "@/lib/giorniChiusiRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const data = searchParams.get("data");
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: "Parametro data mancante o non valido (YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const [{ presenti, warningPermessi }, giornoChiuso] = await Promise.all([
      getPresentiPerData(data),
      isGiornoChiuso(data),
    ]);
    return NextResponse.json({ presenti, warningPermessi, giornoChiuso });
  } catch (e) {
    console.error("[ore/presenti]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
