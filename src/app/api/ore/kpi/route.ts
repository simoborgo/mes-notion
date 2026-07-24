import { NextRequest, NextResponse } from "next/server";
import {
  getKpiTotali, getKpiPerOdp, getKpiPerOperatore, getKpiPerCausale,
  getKpiPerReparto, getTop5OdpRifacimento,
} from "@/lib/oreRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const da = searchParams.get("da");
  const a = searchParams.get("a");
  if (!da || !a) return NextResponse.json({ error: "Parametri da/a mancanti" }, { status: 400 });

  try {
    const [totali, perOdp, perOperatore, perCausale, perReparto, top5Rifacimento] = await Promise.all([
      getKpiTotali(da, a),
      getKpiPerOdp(da, a),
      getKpiPerOperatore(da, a),
      getKpiPerCausale(da, a),
      getKpiPerReparto(da, a),
      getTop5OdpRifacimento(da, a),
    ]);
    return NextResponse.json({ totali, perOdp, perOperatore, perCausale, perReparto, top5Rifacimento });
  } catch (e) {
    console.error("[ore/kpi]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
