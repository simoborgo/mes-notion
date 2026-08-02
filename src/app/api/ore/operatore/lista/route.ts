import { NextRequest, NextResponse } from "next/server";
import { getOperatori } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";

// Qualunque sessione valida (l'identità del singolo operatore è garantita dal PIN, non dal ruolo).
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  try {
    const operatori = await getOperatori();
    return NextResponse.json(operatori);
  } catch (e) {
    console.error("[ore/operatore/lista]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
