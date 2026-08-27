import { NextRequest, NextResponse } from "next/server";
import { getProfiliMetallici, createProfiloMetallico } from "@/lib/profiliMetalliciRepository";
import { getSessionFromRequest, MAGAZZINO_PROFILI_METALLICI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const profili = await getProfiliMetallici({
      soloAttivi: sp.get("includeInattivi") !== "true",
      tipoProfilo: sp.get("tipoProfilo") ?? undefined,
      materiale: sp.get("materiale") ?? undefined,
      fornitore: sp.get("fornitore") ?? undefined,
      clienteRiferimento: sp.get("clienteRiferimento") ?? undefined,
    });
    return NextResponse.json(profili);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero profili metallici" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !MAGAZZINO_PROFILI_METALLICI_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const body = await req.json();

    const profilo = await createProfiloMetallico({
      codice: body.codice ?? null,
      tipoProfilo: body.tipoProfilo ?? null,
      materiale: body.materiale ?? null,
      sezione: body.sezione ?? null,
      lunghezzaMm: body.lunghezzaMm ?? null,
      finitura: body.finitura ?? null,
      colore: body.colore ?? null,
      fornitore: body.fornitore ?? null,
      codiceFornitore: body.codiceFornitore ?? null,
      codiceInventario: body.codiceInventario ?? null,
      unitaMisura: body.unitaMisura ?? null,
      clienteRiferimento: body.clienteRiferimento ?? null,
      createdBy: session.username,
    });

    void logOperation(session.name, "CREATE", "profilo_metallico", profilo.id, { tipoProfilo: profilo.tipoProfilo });
    return NextResponse.json(profilo, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/magazzino/profili-metallici]", message);
    if (message.includes("uq_profili_metallici_")) {
      return NextResponse.json({ error: "Profilo già esistente (codice inventario duplicato)" }, { status: 409 });
    }
    return NextResponse.json({ error: "Errore creazione profilo metallico" }, { status: 500 });
  }
}
