import { NextRequest, NextResponse } from "next/server";
import { getOperatori } from "@/lib/notion";
import { getMatricoleConPin } from "@/lib/operatoriPinRepository";
import { getSessionFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    const [operatori, conPin] = await Promise.all([getOperatori(), getMatricoleConPin()]);
    const lista = operatori.map(o => ({ ...o, hasPin: conPin.has(o.matricola) }));
    return NextResponse.json(lista);
  } catch (e) {
    console.error("[admin/operatori-pin GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
