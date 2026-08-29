import { NextRequest, NextResponse } from "next/server";
import { calcolaPrevisionale, type FiltroPrevisionale } from "@/lib/capacityPlannerRepository";
import { mesiOrizzonteConPassato } from "@/lib/calendarioLavorativo";
import { getSessionFromRequest, PREVISIONALE_ROLES } from "@/lib/auth";

const FILTRI_VALIDI: FiltroPrevisionale[] = ["confermate", "tutte", "pesato"];
// Valori proposti in UI (VistaPrevisionale.tsx) — qui solo il tetto di sicurezza lato server.
const MESI_INDIETRO_MAX = 24;

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
  const mesiIndietroParam = Number(searchParams.get("mesiIndietro"));
  const mesiIndietro = mesiIndietroParam >= 0 && mesiIndietroParam <= MESI_INDIETRO_MAX ? mesiIndietroParam : 0;
  const mesiOrizzonte = mesiOrizzonteConPassato(mesiIndietro, nMesi);

  try {
    const risultato = await calcolaPrevisionale(filtro, mesiOrizzonte);
    return NextResponse.json({ ...risultato, mesiOrizzonte, filtro, mesiIndietro });
  } catch (e) {
    console.error("[previsionale GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
