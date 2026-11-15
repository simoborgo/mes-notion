import { NextRequest, NextResponse } from "next/server";
import { getMaterialeElettrico, createArticoloElettrico } from "@/lib/materialeElettricoRepository";
import { getSessionFromRequest, MAGAZZINO_MATERIALE_ELETTRICO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const articoli = await getMaterialeElettrico({
      soloAttivi: sp.get("includeInattivi") !== "true",
      tipoArticolo: sp.get("tipoArticolo") ?? undefined,
      marca: sp.get("marca") ?? undefined,
      fornitore: sp.get("fornitore") ?? undefined,
      clienteRiferimento: sp.get("clienteRiferimento") ?? undefined,
    });
    return NextResponse.json(articoli);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero materiale elettrico" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !MAGAZZINO_MATERIALE_ELETTRICO_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const body = await req.json();

    const articolo = await createArticoloElettrico({
      codice: body.codice ?? null,
      tipoArticolo: body.tipoArticolo ?? null,
      marca: body.marca ?? null,
      caratteristiche: body.caratteristiche ?? null,
      descrizione: body.descrizione ?? null,
      colore: body.colore ?? null,
      fornitore: body.fornitore ?? null,
      codiceFornitore: body.codiceFornitore ?? null,
      codiceInventario: body.codiceInventario ?? null,
      unitaMisura: body.unitaMisura ?? null,
      clienteRiferimento: body.clienteRiferimento ?? null,
      createdBy: session.username,
    });

    void logOperation(session.name, "CREATE", "articolo_elettrico", articolo.id, { tipoArticolo: articolo.tipoArticolo });
    return NextResponse.json(articolo, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/magazzino/materiale-elettrico]", message);
    if (message.includes("uq_materiale_elettrico_")) {
      return NextResponse.json({ error: "Articolo già esistente (codice inventario duplicato)" }, { status: 409 });
    }
    return NextResponse.json({ error: "Errore creazione articolo elettrico" }, { status: 500 });
  }
}
