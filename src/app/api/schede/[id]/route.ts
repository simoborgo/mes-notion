import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSchedaById, updateScheda, archiveScheda, invalidateSchedeCache } from "@/lib/notion";
import type { SchedaUpdate } from "@/lib/types";
import { getSessionFromRequest, MODIFICA_SCHEDA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";
import { registraChiusuraOdp } from "@/lib/standardRepartoRepository";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const scheda = await getSchedaById(id);
    return NextResponse.json(scheda);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Scheda non trovata" }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSessionFromRequest(req);
    if (!session || !MODIFICA_SCHEDA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const body: SchedaUpdate = await req.json();

    // Fase 4 Gestione Ore avanzato: letta solo quando la richiesta porta davvero a
    // "Completato" (non ad ogni PATCH — foto/note non pagano questa lettura Notion extra).
    const prima = body.statoProduzione === "Completato" ? await getSchedaById(id).catch(() => null) : null;

    const updated = await updateScheda(id, body);

    if (prima && prima.statoProduzione !== "Completato") {
      void registraChiusuraOdp(prima.odp, prima.codiceArticolo || null);
    }

    revalidatePath("/schede");
    invalidateSchedeCache();

    void logOperation(
      session?.name ?? "Sconosciuto",
      "UPDATE",
      "scheda",
      id,
      body as Record<string, unknown>
    );

    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore aggiornamento scheda" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSessionFromRequest(req);
    if (!session || !MODIFICA_SCHEDA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }

    await archiveScheda(id);

    revalidatePath("/schede");
    invalidateSchedeCache();

    void logOperation(session.name, "DELETE", "scheda", id, {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore eliminazione scheda" }, { status: 500 });
  }
}
