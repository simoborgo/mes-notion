import { NextRequest, NextResponse } from "next/server";
import { getOreLavoratePerOdpGiornoReparto } from "@/lib/oreRepository";
import { getSessionFromRequest, APS_GANTT_ROLES } from "@/lib/auth";

// Ore reali lavorate su CNC, per ODP e giorno, in un intervallo — alimenta la Vista CNC
// settimanale (VistaCnc in GanttAps.tsx). Stesso perimetro di accesso della pagina Pianificazione
// (APS) da cui viene chiamata.
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !APS_GANTT_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const odps = (searchParams.get("odps") ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const da = searchParams.get("da");
  const a = searchParams.get("a");
  if (!da || !a || !/^\d{4}-\d{2}-\d{2}$/.test(da) || !/^\d{4}-\d{2}-\d{2}$/.test(a)) {
    return NextResponse.json({ error: "Parametri da/a mancanti o non validi (YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const ore = await getOreLavoratePerOdpGiornoReparto(odps, "CNC", da, a);
    return NextResponse.json(ore);
  } catch (e) {
    console.error("[aps/cnc/ore-giornaliere]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
