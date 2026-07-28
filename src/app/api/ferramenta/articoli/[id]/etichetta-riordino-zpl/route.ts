import { NextRequest, NextResponse } from "next/server";
import { getArticoloFerramentaById } from "@/lib/articoliFerramentaRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { buildEtichettaRiordinoZpl } from "@/lib/zpl";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const articolo = await getArticoloFerramentaById(id);

    if (articolo.metodoGestione !== "Kanban") {
      return NextResponse.json(
        { error: "Articolo non gestito a Kanban: nessuna quantità di riordino da stampare" },
        { status: 400 }
      );
    }

    const qrTarget = `${req.nextUrl.origin}/riordino/${id}`;
    const zpl = buildEtichettaRiordinoZpl({
      codiceOs1: articolo.codiceOs1,
      descrizione: articolo.descrizione,
      fornitoreNome: articolo.fornitoreNome,
      codiceFornitore: articolo.codiceFornitore,
      quantitaStandardVaschetta: articolo.quantitaStandardVaschetta,
      qrUrl: qrTarget,
      stampatoIl: new Date(),
    });

    return new NextResponse(zpl, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="etichetta-riordino-${(articolo.codiceOs1 || id).replace(/\//g, "-")}.zpl"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[ferramenta/etichetta-riordino-zpl]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
