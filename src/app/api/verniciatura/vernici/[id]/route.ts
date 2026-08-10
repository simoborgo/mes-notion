import { NextRequest, NextResponse } from "next/server";
import { getVerniceById, updateVernice, disattivaVernice } from "@/lib/verniciRepository";
import { spostaVerniceFolderPerFornitore } from "@/lib/googleDriveVerniciatura";
import { getSessionFromRequest, VERNICIATURA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

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

// codiceInventario non è modificabile qui di proposito: si scrive solo in creazione (POST).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !VERNICIATURA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();

    const prima = await getVerniceById(id);

    const vernice = await updateVernice(id, {
      coloreCodice: body.coloreCodice,
      coloreNome: body.coloreNome,
      fornitore: body.fornitore,
      codiceTintometro: body.codiceTintometro,
      codiceVendita: body.codiceVendita,
      unitaMisura: body.unitaMisura,
      tipologia: body.tipologia,
      finitura: body.finitura,
      gloss: body.gloss,
      tipoBilancioMassa: body.tipoBilancioMassa,
      clienteRiferimento: body.clienteRiferimento,
      bilancioMassaRaw: body.bilancioMassaRaw,
      attivo: body.attivo,
      updatedBy: session.username,
    });

    void logOperation(session.name, "UPDATE", "vernice", id, body);

    // Cartella Drive già creata (primo upload TS/SDS fatto) e fornitore cambiato: sposta la
    // cartella sotto il nuovo fornitore, senza far fallire il salvataggio se Drive non risponde.
    const warnings: string[] = [];
    if (body.fornitore !== undefined && body.fornitore !== prima.fornitore && prima.driveFolderId) {
      try {
        await spostaVerniceFolderPerFornitore(prima.driveFolderId, body.fornitore);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("[PATCH /api/verniciatura/vernici] spostamento cartella Drive fallito:", message);
        warnings.push(`Vernice aggiornata, ma la cartella Drive non è stata spostata: ${message}`);
      }
    }

    if (warnings.length > 0) return NextResponse.json({ ...vernice, warnings }, { status: 207 });
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
