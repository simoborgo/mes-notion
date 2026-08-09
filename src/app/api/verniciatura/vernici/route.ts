import { NextRequest, NextResponse } from "next/server";
import { getVernici, createVernice } from "@/lib/verniciRepository";
import { normalizzaColoreCodice } from "@/lib/verniciNormalizers";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";
import type { ColoreSistema } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const vernici = await getVernici({
      soloAttivi: sp.get("includeInattivi") !== "true",
      coloreCodice: sp.get("coloreCodice") ?? undefined,
      fornitoreId: sp.get("fornitoreId") ?? undefined,
      famigliaProdotto: sp.get("famigliaProdotto") ?? undefined,
      ruolo: sp.get("ruolo") ?? undefined,
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

    const famigliaProdotto = typeof body.famigliaProdotto === "string" ? body.famigliaProdotto.trim() : "";
    if (!famigliaProdotto) {
      return NextResponse.json({ error: "Famiglia prodotto obbligatoria" }, { status: 400 });
    }

    // Normalizzazione bloccante PRIMA dell'insert: fail fast su colore_codice malformato.
    let coloreCodice: string | null = null;
    if (body.coloreSistema) {
      try {
        coloreCodice = normalizzaColoreCodice(body.coloreSistema as ColoreSistema, String(body.coloreCodice ?? ""));
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "colore_codice non valido" }, { status: 400 });
      }
    }

    const vernice = await createVernice({
      coloreSistema: body.coloreSistema ?? null,
      coloreCodice,
      coloreNome: body.coloreNome ?? null,
      fornitoreId: body.fornitoreId ?? null,
      laboratorioId: body.laboratorioId ?? null,
      codiceTintometro: body.codiceTintometro ?? null,
      codiceVendita: body.codiceVendita ?? null,
      codiceInventario: body.codiceInventario ?? null,
      unitaMisura: body.unitaMisura ?? null,
      famigliaProdotto,
      ruolo: body.ruolo ?? null,
      finitura: body.finitura ?? null,
      gloss: body.gloss ?? null,
      tipoBilancioMassa: body.tipoBilancioMassa ?? null,
      bilancioMassaRaw: body.bilancioMassaRaw ?? null,
      clienteRiferimento: body.clienteRiferimento ?? null,
      createdBy: session.username,
    });

    void logOperation(session.name, "CREATE", "vernice", vernice.id, { famigliaProdotto, coloreCodice });
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
