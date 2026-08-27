import { NextRequest, NextResponse } from "next/server";
import { getBordi, createBordo } from "@/lib/bordiRepository";
import { getSessionFromRequest, MAGAZZINO_BORDI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const bordi = await getBordi({
      soloAttivi: sp.get("includeInattivi") !== "true",
      decorCodice: sp.get("decorCodice") ?? undefined,
      materiale: sp.get("materiale") ?? undefined,
      fornitore: sp.get("fornitore") ?? undefined,
      clienteRiferimento: sp.get("clienteRiferimento") ?? undefined,
    });
    return NextResponse.json(bordi);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero bordi" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !MAGAZZINO_BORDI_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const body = await req.json();

    const bordo = await createBordo({
      codice: body.codice ?? null,
      decorCodice: body.decorCodice ?? null,
      decorNome: body.decorNome ?? null,
      materiale: body.materiale ?? null,
      spessoreMm: body.spessoreMm ?? null,
      altezzaMm: body.altezzaMm ?? null,
      finitura: body.finitura ?? null,
      fornitore: body.fornitore ?? null,
      codiceFornitore: body.codiceFornitore ?? null,
      codiceInventario: body.codiceInventario ?? null,
      unitaMisura: body.unitaMisura ?? null,
      clienteRiferimento: body.clienteRiferimento ?? null,
      createdBy: session.username,
    });

    void logOperation(session.name, "CREATE", "bordo", bordo.id, { decorCodice: bordo.decorCodice, materiale: bordo.materiale });
    return NextResponse.json(bordo, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/magazzino/bordi]", message);
    if (message.includes("uq_bordi_")) {
      return NextResponse.json({ error: "Bordo già esistente (codice inventario duplicato)" }, { status: 409 });
    }
    return NextResponse.json({ error: "Errore creazione bordo" }, { status: 500 });
  }
}
