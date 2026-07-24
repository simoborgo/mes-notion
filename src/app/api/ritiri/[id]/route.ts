import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updateRitiro, deleteRitiro, getRitiriByScheda, getRitiroById, getSchedaById, createRilavorazione, updateSchedaRientrato, updateSchedaConsegnaFatta, updateRilavorazioneRientrata } from "@/lib/notion";
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

    // NC appena attivato + Consegna + Scheda collegata + nessuna Rilavorazione già
    // presente → crea la Rilavorazione e ricollega questo movimento (come in creazione).
    const current = await getRitiroById(id);
    const effectiveSchedaId = body!.schedaId !== undefined ? body!.schedaId : current.numeroOrdineId;
    const effectiveTipo = body!.tipoMovimento !== undefined ? body!.tipoMovimento : current.tipoMovimento;
    const isNC = body!.nc === true && !current.rilavorazioneId && effectiveTipo === "Consegna" && !!effectiveSchedaId;

    if (isNC) {
      try {
        const parentScheda = await getSchedaById(effectiveSchedaId!);
        const descrizioneRilavorazione = `Rilavorazione NC - ${parentScheda.numeroScheda || parentScheda.odp}`;
        const result = await createRilavorazione({
          parentId: effectiveSchedaId!,
          descrizione: descrizioneRilavorazione,
          fornitoreId: (body!.fornitoreId !== undefined ? body!.fornitoreId : null) ?? null,
          dataRientro: body!.dataTrasporto !== undefined ? body!.dataTrasporto : current.dataTrasporto,
          creaRitiro: false,
          parent: parentScheda,
        });
        // Il movimento si ricollega alla rilavorazione appena creata (non più al padre):
        // così l'ODP/Commessa mostrato è quello della rilavorazione
        body!.rilavorazioneId = result.rilavorazione.id;
        body!.schedaId = result.rilavorazione.id;
      } catch (e) {
        console.error("[PATCH /api/ritiri] createRilavorazione error:", e);
        return NextResponse.json(
          { error: "Impossibile creare la Rilavorazione su Notion" },
          { status: 502 }
        );
      }
    }

    const updated = await updateRitiro(id, body!);

    if (updated.stato === "Fatto") {
      void (async () => {
        try {
          // Ritiri/Consegne legati a una rilavorazione: logica dedicata
          if (updated.rilavorazioneId) {
            if (updated.tipoMovimento === "Ritiro") {
              // Pezzo tornato fisicamente: Stato Produzione Esterna = "Rientrato"
              // Parent rimane "In Attesa Rilavorazione" fino a "Segna Rientrata" manuale
              await updateRilavorazioneRientrata(updated.rilavorazioneId);
              revalidatePath("/schede");
            }
            // Consegna → Fatto: nessun cambio stato (solo tracking logistico)
            return;
          }

          // Flusso standard schede: aggiorna solo se TUTTI i ritiri di quella scheda sono Fatto
          if (updated.numeroOrdineId) {
            const schedaId = updated.numeroOrdineId;
            const tuttiRitiri = await getRitiriByScheda(schedaId);
            const tuttiCompleti = tuttiRitiri.every(r => r.stato === "Fatto");
            if (!tuttiCompleti) return;

            if (updated.tipoMovimento === "Ritiro") {
              await updateSchedaRientrato(schedaId);
              revalidatePath("/schede");
            } else if (updated.tipoMovimento === "Consegna") {
              await updateSchedaConsegnaFatta(schedaId);
              revalidatePath("/schede");
            }
          }
        } catch (e) {
          console.error("[PATCH ritiri] aggiornamento scheda post-completamento:", e);
        }
      })();
    }

    revalidatePath("/ritiri");
    if (isNC || effectiveSchedaId) revalidatePath("/schede");

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
