import { NextRequest, NextResponse } from "next/server";
import { getVerniceById, updateVernice, disattivaVernice } from "@/lib/verniciRepository";
import { normalizzaColoreCodice } from "@/lib/verniciNormalizers";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";
import type { ColoreSistema } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const vernice = await getVerniceById(id);
    return NextResponse.json(vernice);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();

    let coloreCodice: string | undefined = undefined;
    if (body.coloreCodice !== undefined) {
      if (body.coloreCodice === null) {
        coloreCodice = undefined; // niente modifica se non accompagnato da un sistema valido
      } else {
        const sistema = (body.coloreSistema as ColoreSistema | undefined) ?? (await getVerniceById(id)).coloreSistema;
        if (!sistema) {
          return NextResponse.json({ error: "colore_sistema obbligatorio per normalizzare colore_codice" }, { status: 400 });
        }
        try {
          coloreCodice = normalizzaColoreCodice(sistema, String(body.coloreCodice));
        } catch (e) {
          return NextResponse.json({ error: e instanceof Error ? e.message : "colore_codice non valido" }, { status: 400 });
        }
      }
    }

    const vernice = await updateVernice(id, {
      coloreSistema: body.coloreSistema,
      coloreCodice,
      coloreNome: body.coloreNome,
      fornitoreId: body.fornitoreId,
      laboratorioId: body.laboratorioId,
      codiceTintometro: body.codiceTintometro,
      codiceVendita: body.codiceVendita,
      codiceInventario: body.codiceInventario,
      unitaMisura: body.unitaMisura,
      famigliaProdotto: body.famigliaProdotto,
      ruolo: body.ruolo,
      finitura: body.finitura,
      gloss: body.gloss,
      tipoBilancioMassa: body.tipoBilancioMassa,
      clienteRiferimento: body.clienteRiferimento,
      bilancioMassaRaw: body.bilancioMassaRaw,
      attivo: body.attivo,
      updatedBy: session.username,
    });

    void logOperation(session.name, "UPDATE", "vernice", id, body);
    return NextResponse.json(vernice);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[PATCH /api/verniciatura/vernici]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;

    await disattivaVernice(id);
    void logOperation(session.name, "DELETE", "vernice", id, {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/verniciatura/vernici]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
