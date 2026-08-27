import { NextRequest, NextResponse } from "next/server";
import { getLegni, createLegno } from "@/lib/legnoRepository";
import { getSessionFromRequest, MAGAZZINO_LEGNO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const legni = await getLegni({
      soloAttivi: sp.get("includeInattivi") !== "true",
      essenza: sp.get("essenza") ?? undefined,
      fornitore: sp.get("fornitore") ?? undefined,
      clienteRiferimento: sp.get("clienteRiferimento") ?? undefined,
    });
    return NextResponse.json(legni);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero legname" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !MAGAZZINO_LEGNO_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const body = await req.json();

    const legno = await createLegno({
      codice: body.codice ?? null,
      essenza: body.essenza ?? null,
      qualita: body.qualita ?? null,
      spessoreMm: body.spessoreMm ?? null,
      larghezzaMm: body.larghezzaMm ?? null,
      lunghezzaMm: body.lunghezzaMm ?? null,
      fornitore: body.fornitore ?? null,
      codiceFornitore: body.codiceFornitore ?? null,
      codiceInventario: body.codiceInventario ?? null,
      unitaMisura: body.unitaMisura ?? null,
      clienteRiferimento: body.clienteRiferimento ?? null,
      createdBy: session.username,
    });

    void logOperation(session.name, "CREATE", "legno", legno.id, { essenza: legno.essenza });
    return NextResponse.json(legno, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/magazzino/legno]", message);
    if (message.includes("uq_legni_")) {
      return NextResponse.json({ error: "Legno già esistente (codice inventario duplicato)" }, { status: 409 });
    }
    return NextResponse.json({ error: "Errore creazione legno" }, { status: 500 });
  }
}
