import { NextRequest, NextResponse } from "next/server";
import { getSegmentoAperto, getSegmentiOggi } from "@/lib/segmentiOperatoreRepository";
import { getSessionFromRequest } from "@/lib/auth";

function oggiStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const matricola = searchParams.get("matricola");
  if (!matricola) return NextResponse.json({ error: "Parametro matricola mancante" }, { status: 400 });

  try {
    const [aperto, segmentiOggi] = await Promise.all([
      getSegmentoAperto(matricola),
      getSegmentiOggi(matricola, oggiStr()),
    ]);
    return NextResponse.json({ aperto, segmentiOggi });
  } catch (e) {
    console.error("[ore/operatore/stato]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
