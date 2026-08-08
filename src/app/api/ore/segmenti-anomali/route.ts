import { NextRequest, NextResponse } from "next/server";
import { getSegmentiAnomali } from "@/lib/segmentiOperatoreRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";
import { getTuttiOperatori, getSchede } from "@/lib/notion";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  try {
    const [segmenti, operatori, schede] = await Promise.all([
      getSegmentiAnomali(),
      getTuttiOperatori(),
      getSchede(),
    ]);
    const operatoreByMatricola = new Map(operatori.map(o => [o.matricola, o]));
    const numeroSchedaByOdp = new Map(schede.filter(s => s.odp).map(s => [s.odp, s.numeroScheda]));

    const arricchiti = segmenti.map(s => {
      const op = operatoreByMatricola.get(s.matricola);
      return {
        ...s,
        cognome: op?.cognome ?? null,
        nome: op?.nome ?? null,
        reparto: op?.reparto ?? null,
        numeroScheda: numeroSchedaByOdp.get(s.odp) ?? null,
      };
    });

    return NextResponse.json(arricchiti);
  } catch (e) {
    console.error("[ore/segmenti-anomali]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
