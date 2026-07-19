import { NextRequest, NextResponse } from "next/server";
import { updateRitiro, deleteRitiro, getRitiriByScheda, updateSchedaRientrato, updateSchedaConsegnaFatta } from "@/lib/notion";
import type { RitiroUpdate } from "@/lib/types";
import { getSessionFromRequest, WRITE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let body: RitiroUpdate | undefined;
  try {
    const { id } = await params;
    const session = await getSessionFromRequest(req);
    if (!session || !WRITE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    body = await req.json();
    console.log("[PATCH /api/ritiri/%s] operatore:%s payload:", id, session?.name, JSON.stringify(body));
    const updated = await updateRitiro(id, body!);

    // Quando il movimento è completato e collegato a una scheda ODP →
    // aggiorna la scheda solo se TUTTI i ritiri collegati a quell'ODP sono "Fatto"
    if (updated.stato === "Fatto" && updated.numeroOrdineId) {
      const schedaId = updated.numeroOrdineId;
      const tipoMovimento = updated.tipoMovimento;
      void (async () => {
        try {
          const tuttiRitiri = await getRitiriByScheda(schedaId);
          const tuttiCompleti = tuttiRitiri.every(r => r.stato === "Fatto");
          if (!tuttiCompleti) return;

          if (tipoMovimento === "Ritiro") {
            await updateSchedaRientrato(schedaId);
          } else if (tipoMovimento === "Consegna") {
            await updateSchedaConsegnaFatta(schedaId);
          }
        } catch (e) {
          console.error("[PATCH ritiri] aggiornamento scheda post-completamento:", e);
        }
      })();
    }

    // Audit log — fire-and-forget, non blocca la risposta
    void logOperation(
      session?.name ?? "Sconosciuto",
      "UPDATE",
      "ritiro",
      id,
      body as Record<string, unknown>
    );

    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[PATCH /api/ritiri] FAILED — payload:", JSON.stringify(body));
    console.error("[PATCH /api/ritiri] ERROR:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSessionFromRequest(req);

    // Solo gli admin possono eliminare record
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Permesso negato — solo gli admin possono eliminare record" }, { status: 403 });
    }

    await deleteRitiro(id);

    void logOperation(session.name, "DELETE", "ritiro", id, {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/ritiri] ERROR:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
