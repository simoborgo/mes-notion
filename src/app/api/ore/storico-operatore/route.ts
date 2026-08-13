import { NextRequest, NextResponse } from "next/server";
import { getStoricoOperatore } from "@/lib/oreRepository";
import { getSchede } from "@/lib/schedeRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const matricola = searchParams.get("matricola");
  if (!matricola) return NextResponse.json({ error: "Parametro matricola mancante" }, { status: 400 });
  const da = searchParams.get("da") ?? undefined;
  const a = searchParams.get("a") ?? undefined;
  try {
    const [voci, schede] = await Promise.all([getStoricoOperatore(matricola, da, a), getSchede()]);
    // Codice articolo joinato a runtime da Notion (mai salvato su ore_registrate) — vedi
    // ore/presenti e ore/storico-odp per lo stesso pattern.
    const codiceArticoloPerOdp = new Map<string, string | null>();
    for (const s of schede) {
      if (s.odp && !codiceArticoloPerOdp.has(s.odp)) codiceArticoloPerOdp.set(s.odp, s.codiceArticolo || null);
    }
    const vociArricchite = voci.map(v => ({ ...v, codiceArticolo: codiceArticoloPerOdp.get(v.odp) ?? null }));
    return NextResponse.json(vociArricchite);
  } catch (e) {
    console.error("[ore/storico-operatore]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
