import { NextRequest, NextResponse } from "next/server";
import { upsertAssenzaManuale, eliminaAssenzaManuale } from "@/lib/assenzeRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { data, matricola } = body;
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !matricola) {
    return NextResponse.json({ error: "data (YYYY-MM-DD) e matricola sono obbligatori" }, { status: 400 });
  }
  const ore = body.ore === null || body.ore === undefined ? null : Number(body.ore);
  if (ore !== null && !(ore > 0)) {
    return NextResponse.json({ error: "ore, se indicate, devono essere > 0" }, { status: 400 });
  }

  try {
    const riga = await upsertAssenzaManuale(data, matricola, ore);
    void logOperation(session.name, "UPDATE", "ore_assenza", `${matricola}:${data}`, { ore });
    return NextResponse.json(riga);
  } catch (e) {
    console.error("[ore/assenze POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const data = searchParams.get("data");
  const matricola = searchParams.get("matricola");
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !matricola) {
    return NextResponse.json({ error: "Parametri data e matricola mancanti o non validi" }, { status: 400 });
  }

  try {
    await eliminaAssenzaManuale(data, matricola);
    void logOperation(session.name, "DELETE", "ore_assenza", `${matricola}:${data}`, {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[ore/assenze DELETE]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
