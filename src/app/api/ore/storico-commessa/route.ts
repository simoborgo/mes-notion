import { NextRequest, NextResponse } from "next/server";
import { getStoricoOdps } from "@/lib/oreRepository";
import { getSchedeByCommessa, getCommessaById } from "@/lib/notion";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

const COSTO_ORARIO = 41;

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const commessaId = new URL(req.url).searchParams.get("commessaId");
  if (!commessaId) return NextResponse.json({ error: "Parametro commessaId mancante" }, { status: 400 });

  try {
    const [commessa, schede] = await Promise.all([
      getCommessaById(commessaId),
      getSchedeByCommessa(commessaId),
    ]);

    const odpInfo = new Map<string, { codiceArticolo: string | null; numeroScheda: string }>();
    for (const s of schede) {
      if (!s.odp || odpInfo.has(s.odp)) continue;
      odpInfo.set(s.odp, { codiceArticolo: s.codiceArticolo || null, numeroScheda: s.numeroScheda });
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

    const perOperatore = new Map<string, { matricola: string; cognome: string; nome: string; ore: number }>();
    for (const v of voci) {
      if (!perOperatore.has(v.matricola)) {
        perOperatore.set(v.matricola, { matricola: v.matricola, cognome: v.cognome, nome: v.nome, ore: 0 });
      }
      perOperatore.get(v.matricola)!.ore += v.ore;
    }

    const oreTotali = voci.reduce((s, v) => s + v.ore, 0);
    const oreRifacimento = voci.filter(v => v.rif).reduce((s, v) => s + v.ore, 0);

    return NextResponse.json({
      commessa: { id: commessa.id, numeroCommessa: commessa.numeroCommessa, cliente: commessa.cliente },
      totali: {
        oreTotali,
        oreRifacimento,
        costoTotale: Math.round(oreTotali * COSTO_ORARIO * 100) / 100,
      },
      perArticolo: [...perArticolo.values()].sort((a, b) => b.ore - a.ore),
      perOperatore: [...perOperatore.values()].sort((a, b) => a.cognome.localeCompare(b.cognome)),
    });
  } catch (e) {
    console.error("[ore/storico-commessa]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
