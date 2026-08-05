import { NextRequest, NextResponse } from "next/server";
import { calcolaPrevisionale, type FiltroPrevisionale } from "@/lib/capacityPlannerRepository";
import { mesiOrizzonteDaOggi } from "@/lib/calendarioLavorativo";
import { getSessionFromRequest, PREVISIONALE_ROLES } from "@/lib/auth";

const FILTRI_VALIDI: FiltroPrevisionale[] = ["confermate", "tutte", "pesato"];

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !PREVISIONALE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const filtroParam = searchParams.get("filtro");
  const filtro: FiltroPrevisionale = filtroParam && FILTRI_VALIDI.includes(filtroParam as FiltroPrevisionale)
    ? (filtroParam as FiltroPrevisionale)
    : "tutte";
  const mesiParam = Number(searchParams.get("mesi"));
  const nMesi = mesiParam > 0 && mesiParam <= 24 ? mesiParam : 12;
  const mesiOrizzonte = mesiOrizzonteDaOggi(nMesi);

  try {
    const risultato = await calcolaPrevisionale(filtro, mesiOrizzonte);
    return NextResponse.json({ ...risultato, mesiOrizzonte, filtro });
  } catch (e) {
    console.error("[previsionale GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
