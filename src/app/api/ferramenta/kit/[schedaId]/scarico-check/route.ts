import { NextRequest, NextResponse } from "next/server";
import { getDistintaKitByOdp } from "@/lib/kitFerramentaRepository";
import { getMovimentiByOdp } from "@/lib/ferramentaRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";

// Usato dai form di scarico per avvisare (soft, non bloccante) quando la quantità che si sta
// per scaricare supererebbe il pianificato in distinta per quell'ODP+articolo — considerando
// anche quanto già scaricato in precedenza per la stessa coppia.
export async function GET(req: NextRequest, { params }: { params: Promise<{ schedaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { schedaId } = await params;
  const articoloId = req.nextUrl.searchParams.get("articoloId");
  if (!articoloId) {
    return NextResponse.json({ error: "articoloId mancante" }, { status: 400 });
  }

  const [distinta, movimenti] = await Promise.all([
    getDistintaKitByOdp(schedaId),
    getMovimentiByOdp(schedaId),
  ]);

  const riga = distinta.find(r => r.articoloId === articoloId);
  const giaScaricato = movimenti
    .filter(m => m.articoloId === articoloId && (m.tipo === "scarico_kanban" || m.tipo === "scarico_a_pezzo"))
    .reduce((sum, m) => sum + m.quantita, 0);

  return NextResponse.json({
    pianificato: riga?.quantita ?? null,
    giaScaricato,
  });
}
