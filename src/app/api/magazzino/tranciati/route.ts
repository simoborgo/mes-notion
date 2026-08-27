import { NextRequest, NextResponse } from "next/server";
import { getTranciati, createTranciato } from "@/lib/tranciatiRepository";
import { getSessionFromRequest, MAGAZZINO_TRANCIATI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const tranciati = await getTranciati({
      soloAttivi: sp.get("includeInattivi") !== "true",
      essenza: sp.get("essenza") ?? undefined,
      fornitore: sp.get("fornitore") ?? undefined,
      clienteRiferimento: sp.get("clienteRiferimento") ?? undefined,
    });
    return NextResponse.json(tranciati);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero tranciati" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !MAGAZZINO_TRANCIATI_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const body = await req.json();

    const tranciato = await createTranciato({
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

    void logOperation(session.name, "CREATE", "tranciato", tranciato.id, { essenza: tranciato.essenza });
    return NextResponse.json(tranciato, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/magazzino/tranciati]", message);
    if (message.includes("uq_tranciati_")) {
      return NextResponse.json({ error: "Tranciato già esistente (codice inventario duplicato)" }, { status: 409 });
    }
    return NextResponse.json({ error: "Errore creazione tranciato" }, { status: 500 });
  }
}
