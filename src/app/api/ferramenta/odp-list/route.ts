import { NextRequest, NextResponse } from "next/server";
import { getOdpAttivi } from "@/lib/schedeRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";

// Separata dall'API GET/POST della pagina: caricata lato client SOLO quando serve (form ODP
// facoltativo di "Nuovo Scarico"), invece di bloccare il rendering server-side della pagina —
// getOdpAttivi() dipende dalla cache Notion delle Schede, a freddo può richiedere 15-20s.
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    const odp = await getOdpAttivi();
    return NextResponse.json(odp);
  } catch (e) {
    console.error("[ferramenta/odp-list]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
