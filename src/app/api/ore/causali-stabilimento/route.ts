import { NextRequest, NextResponse } from "next/server";
import { getOreCausaliStabilimento } from "@/lib/oreRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

const COSTO_ORARIO = 41;

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const da = searchParams.get("da") ?? undefined;
  const a = searchParams.get("a") ?? undefined;

  try {
    const voci = await getOreCausaliStabilimento(da, a);

    const perCategoria = new Map<string, number>();
    const perMese = new Map<string, Record<string, number>>();
    const perOperatore = new Map<string, { matricola: string; cognome: string; nome: string; reparto: string | null; ore: number; perCategoria: Record<string, number> }>();

    for (const v of voci) {
      perCategoria.set(v.categoria, (perCategoria.get(v.categoria) ?? 0) + v.ore);

      const mese = v.data.slice(0, 7);
      const m = perMese.get(mese) ?? {};
      m[v.categoria] = (m[v.categoria] ?? 0) + v.ore;
      perMese.set(mese, m);

      let o = perOperatore.get(v.matricola);
      if (!o) {
        o = { matricola: v.matricola, cognome: v.cognome, nome: v.nome, reparto: v.reparto, ore: 0, perCategoria: {} };
        perOperatore.set(v.matricola, o);
      }
      o.ore += v.ore;
      o.perCategoria[v.categoria] = (o.perCategoria[v.categoria] ?? 0) + v.ore;
    }

    const oreTotali = voci.reduce((s, v) => s + v.ore, 0);
    return NextResponse.json({
      totali: { oreTotali, costoTotale: Math.round(oreTotali * COSTO_ORARIO * 100) / 100 },
      perCategoria: [...perCategoria.entries()].map(([categoria, ore]) => ({ categoria, ore })).sort((x, y) => y.ore - x.ore),
      perMese: [...perMese.entries()].map(([mese, cat]) => ({ mese, perCategoria: cat })).sort((x, y) => x.mese.localeCompare(y.mese)),
      perOperatore: [...perOperatore.values()].sort((x, y) => y.ore - x.ore),
    });
  } catch (e) {
    console.error("[ore/causali-stabilimento]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
