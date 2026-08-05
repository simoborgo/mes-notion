import { NextRequest, NextResponse } from "next/server";
import { creaOfferta, getOfferte, type StatoOfferta } from "@/lib/offerteRepository";
import { getSessionFromRequest, OFFERTE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const STATI_VALIDI: StatoOfferta[] = ["Offerta", "Confermata", "Persa"];

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !OFFERTE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const statoParam = searchParams.get("stato");
  const stato = statoParam && STATI_VALIDI.includes(statoParam as StatoOfferta) ? (statoParam as StatoOfferta) : undefined;
  try {
    const offerte = await getOfferte(stato);
    return NextResponse.json(offerte);
  } catch (e) {
    console.error("[offerte GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !OFFERTE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const cliente = typeof body.cliente === "string" ? body.cliente.trim() : "";
  const dataOfferta = typeof body.dataOfferta === "string" ? body.dataOfferta : "";
  if (!cliente || !dataOfferta) {
    return NextResponse.json({ error: "Cliente e data offerta sono obbligatori" }, { status: 400 });
  }
  const valoreCommessa = body.valoreCommessa != null && body.valoreCommessa !== "" ? Number(body.valoreCommessa) : null;
  const dataConsegnaPrevista = typeof body.dataConsegnaPrevista === "string" && body.dataConsegnaPrevista ? body.dataConsegnaPrevista : null;
  const probabilitaChiusura = body.probabilitaChiusura != null && body.probabilitaChiusura !== "" ? Number(body.probabilitaChiusura) : 40;

  try {
    const offerta = await creaOfferta({ cliente, valoreCommessa, dataOfferta, dataConsegnaPrevista, probabilitaChiusura, creatoDa: session.name });
    void logOperation(session.name, "CREATE", "offerta", offerta.id, { cliente, dataOfferta });
    return NextResponse.json(offerta);
  } catch (e) {
    console.error("[offerte POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
