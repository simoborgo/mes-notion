import { NextRequest, NextResponse } from "next/server";
import { getParametriReparto, aggiornaParametriReparto } from "@/lib/parametriRepartoRepository";
import { getSessionFromRequest, PARAMETRI_REPARTO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";
import { REPARTI_PRODUZIONE } from "@/lib/types";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !PARAMETRI_REPARTO_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    const parametri = await getParametriReparto();
    return NextResponse.json(parametri);
  } catch (e) {
    console.error("[admin/parametri-reparto GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !PARAMETRI_REPARTO_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const reparto = typeof body.reparto === "string" ? body.reparto : "";
  if (!REPARTI_PRODUZIONE.includes(reparto)) {
    return NextResponse.json({ error: "Reparto non valido" }, { status: 400 });
  }
  const nPersone = Number(body.nPersone);
  const oreGiorno = Number(body.oreGiorno);
  const pctStraordinariMax = Number(body.pctStraordinariMax);
  const margineSicurezzaEsterni = Number(body.margineSicurezzaEsterni);
  if (!(nPersone >= 0) || !(oreGiorno > 0) || !(pctStraordinariMax >= 0) || !(margineSicurezzaEsterni >= 0)) {
    return NextResponse.json({ error: "Valori non validi" }, { status: 400 });
  }
  const tariffaEsternaEurH = body.tariffaEsternaEurH != null && body.tariffaEsternaEurH !== "" ? Number(body.tariffaEsternaEurH) : null;
  const oreGiornoEsterno = body.oreGiornoEsterno != null && body.oreGiornoEsterno !== "" ? Number(body.oreGiornoEsterno) : null;

  try {
    const aggiornato = await aggiornaParametriReparto(reparto, {
      nPersone, oreGiorno, pctStraordinariMax, margineSicurezzaEsterni, tariffaEsternaEurH, oreGiornoEsterno,
    });
    if (!aggiornato) return NextResponse.json({ error: "Reparto non trovato" }, { status: 404 });
    void logOperation(session.name, "UPDATE", "parametri_reparto", reparto, { ...body });
    return NextResponse.json(aggiornato);
  } catch (e) {
    console.error("[admin/parametri-reparto PATCH]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
