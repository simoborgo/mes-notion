import { NextResponse } from "next/server";
import { getStoricoOdps } from "@/lib/oreRepository";
import { getOdpAttivi } from "@/lib/schedeRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";
import type { NextRequest } from "next/server";

const COSTO_ORARIO = 41;

// Stesso raggruppamento di /api/ore/storico-commessa (perArticolo), ma senza filtro su una
// commessa: copre tutti gli ODP attivi (getOdpAttivi() esclude già i codici speciali
// SET/MNT/MEET/FORM/PUL, che non hanno un codice articolo per definizione).
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  try {
    const odpAttivi = await getOdpAttivi();

    const odpInfo = new Map<string, { codiceArticolo: string | null; numeroScheda: string }>();
    for (const o of odpAttivi) {
      if (o.isSpeciale || !o.odp || odpInfo.has(o.odp)) continue;
      odpInfo.set(o.odp, { codiceArticolo: o.codiceArticolo || null, numeroScheda: o.numeroScheda ?? o.odp });
    }

    const voci = await getStoricoOdps([...odpInfo.keys()]);

    const perArticolo = new Map<string, { codiceArticolo: string | null; numeroScheda: string | null; ore: number; oreRifacimento: number }>();
    for (const v of voci) {
      const info = odpInfo.get(v.odp);
      const key = info?.codiceArticolo ?? `__non_classificato__${v.odp}`;
      if (!perArticolo.has(key)) {
        perArticolo.set(key, {
          codiceArticolo: info?.codiceArticolo ?? null,
          numeroScheda: info?.codiceArticolo ? null : (info?.numeroScheda ?? v.odp),
          ore: 0,
          oreRifacimento: 0,
        });
      }
      const bucket = perArticolo.get(key)!;
      bucket.ore += v.ore;
      if (v.rif) bucket.oreRifacimento += v.ore;
    }

    const oreTotali = voci.reduce((s, v) => s + v.ore, 0);
    const oreRifacimento = voci.filter(v => v.rif).reduce((s, v) => s + v.ore, 0);

    return NextResponse.json({
      totali: {
        oreTotali,
        oreRifacimento,
        costoTotale: Math.round(oreTotali * COSTO_ORARIO * 100) / 100,
      },
      perArticolo: [...perArticolo.values()].sort((a, b) => b.ore - a.ore),
    });
  } catch (e) {
    console.error("[ore/storico-articolo]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
