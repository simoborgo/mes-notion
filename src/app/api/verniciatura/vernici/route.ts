import { NextRequest, NextResponse } from "next/server";
import { getVernici, createVernice } from "@/lib/verniciRepository";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const vernici = await getVernici({
      soloAttivi: sp.get("includeInattivi") !== "true",
      coloreCodice: sp.get("coloreCodice") ?? undefined,
      fornitore: sp.get("fornitore") ?? undefined,
      tipologia: sp.get("tipologia") ?? undefined,
      tipoBilancioMassa: sp.get("tipoBilancioMassa") ?? undefined,
      clienteRiferimento: sp.get("clienteRiferimento") ?? undefined,
    });
    return NextResponse.json(vernici);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero vernici" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const body = await req.json();

    const tipologia = typeof body.tipologia === "string" ? body.tipologia.trim() : "";
    if (!tipologia) {
      return NextResponse.json({ error: "Tipologia obbligatoria" }, { status: 400 });
    }

    const vernice = await createVernice({
      coloreCodice: body.coloreCodice ?? null,
      coloreNome: body.coloreNome ?? null,
      fornitore: body.fornitore ?? null,
      codiceTintometro: body.codiceTintometro ?? null,
      codiceVendita: body.codiceVendita ?? null,
      codiceInventario: body.codiceInventario ?? null,
      unitaMisura: body.unitaMisura ?? null,
      tipologia,
      finitura: body.finitura ?? null,
      gloss: body.gloss ?? null,
      tipoBilancioMassa: body.tipoBilancioMassa ?? null,
      bilancioMassaRaw: body.bilancioMassaRaw ?? null,
      clienteRiferimento: body.clienteRiferimento ?? null,
      createdBy: session.username,
    });

    void logOperation(session.name, "CREATE", "vernice", vernice.id, { tipologia });
    return NextResponse.json(vernice, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/verniciatura/vernici]", message);
    if (message.includes("uq_vernici_")) {
      return NextResponse.json({ error: "Vernice già esistente (codice tintometro o inventario duplicato)" }, { status: 409 });
    }
    return NextResponse.json({ error: "Errore creazione vernice" }, { status: 500 });
  }
}
