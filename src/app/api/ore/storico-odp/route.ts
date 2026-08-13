import { NextRequest, NextResponse } from "next/server";
import { getStoricoOdp, categoriaFromOdp } from "@/lib/oreRepository";
import { getSchede } from "@/lib/schedeRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const odp = new URL(req.url).searchParams.get("odp");
  if (!odp) return NextResponse.json({ error: "Parametro odp mancante" }, { status: 400 });
  try {
    const [voci, schede] = await Promise.all([getStoricoOdp(odp), getSchede()]);
    // Codice articolo joinato a runtime da Notion (mai salvato su ore_registrate), così un
    // codice aggiunto sulla Scheda dopo la registrazione delle ore compare comunque subito.
    const categoria = categoriaFromOdp(odp);
    const scheda = categoria === "COMMESSA" ? schede.find(s => s.odp === odp) : undefined;
    return NextResponse.json({
      voci,
      categoria,
      codiceArticolo: scheda?.codiceArticolo || null,
      numeroScheda: scheda?.numeroScheda ?? null,
    });
  } catch (e) {
    console.error("[ore/storico-odp]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
