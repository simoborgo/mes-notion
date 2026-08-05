import { NextRequest, NextResponse } from "next/server";
import { getSegmentoAperto, getSegmentiOggi } from "@/lib/segmentiOperatoreRepository";
import { getOdpGiornoPrecedenteMap } from "@/lib/oreRepository";
import { getSessionFromRequest } from "@/lib/auth";

function oggiStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function giornoPrecedente(dataStr: string): string {
  const [y, m, d] = dataStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d - 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const matricola = searchParams.get("matricola");
  if (!matricola) return NextResponse.json({ error: "Parametro matricola mancante" }, { status: 400 });

  try {
    const oggi = oggiStr();
    const [aperto, segmentiOggi, odpGiornoPrecedenteMap] = await Promise.all([
      getSegmentoAperto(matricola),
      getSegmentiOggi(matricola, oggi),
      getOdpGiornoPrecedenteMap([matricola], giornoPrecedente(oggi)),
    ]);
    return NextResponse.json({ aperto, segmentiOggi, odpGiornoPrecedente: odpGiornoPrecedenteMap[matricola] ?? null });
  } catch (e) {
    console.error("[ore/operatore/stato]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
