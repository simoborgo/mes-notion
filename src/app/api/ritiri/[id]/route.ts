import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSchedaById, updateSchedaRientrato, updateSchedaConsegnaFatta, updateRilavorazioneRientrata } from "@/lib/schedeRepository";
import { updateRitiro, deleteRitiro, getRitiriByScheda, getRitiroById, createRilavorazione } from "@/lib/ritiriRepository";
import { TRASPORTI_MOVIMENTO, type RitiroUpdate } from "@/lib/types";
import { getSessionFromRequest, WRITE_ROLES, MODIFICA_SCHEDA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";
import { notificaRientroGiro } from "@/lib/notificheGiri";
import { getGiroAttivoId } from "@/lib/giriRepository";
import { getPublicBaseUrl } from "@/lib/url";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let body: RitiroUpdate | undefined;
  try {
    const { id } = await params;
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    body = await req.json();
    console.log("[PATCH /api/ritiri/%s] operatore:%s payload:", id, session?.name, JSON.stringify(body));
    // "Fatto dal fornitore" = { stato: "Fatto", trasporto: "Fornitore" }: passa dalla stessa logica
    // "Fatto → giro" sotto, il giro avanza come per un trasporto Modar. Chi muove il giro dalla
    // scheda (Produzione) può fare solo questo, e solo su un movimento di un giro: come per la
    // chiusura dei movimenti dopo uscita/rientro (movimenti-aperti).
    if (body!.trasporto !== undefined && !TRASPORTI_MOVIMENTO.includes(body!.trasporto)) {
      return NextResponse.json({ error: "Trasporto non valido" }, { status: 400 });
    }
    const soloFattoDalFornitore = Object.keys(body!).sort().join() === "stato,trasporto"
      && body!.stato === "Fatto" && body!.trasporto === "Fornitore";
    if (!WRITE_ROLES.includes(session.role)) {
      const ammesso = soloFattoDalFornitore && MODIFICA_SCHEDA_ROLES.includes(session.role)
        && !!(await getRitiroById(id).catch(() => null))?.giroId;
      if (!ammesso) return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }

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
      const contestoNotifica = { autore: session.name, origine: "Ritiri e Consegne", baseUrl: getPublicBaseUrl(req) };
      void (async () => {
        try {
          // Ritiri/Consegne legati a una rilavorazione: logica dedicata
          if (updated.rilavorazioneId) {
            if (updated.tipoMovimento === "Ritiro") {
              // Pezzo tornato fisicamente: Stato Produzione Esterna = "Rientrato"
              // Parent rimane "In Attesa Rilavorazione" fino a "Segna Rientrata" manuale
              const giroRientro = updated.giroId ?? await getGiroAttivoId(updated.rilavorazioneId);
              await updateRilavorazioneRientrata(updated.rilavorazioneId, updated.giroId);
              revalidatePath("/schede");
              await notificaRientroGiro(giroRientro, contestoNotifica);
            }
            // Consegna → Fatto: nessun cambio stato (solo tracking logistico)
            return;
          }

          // Flusso standard schede: aggiorna solo se TUTTI i ritiri di quella scheda sono Fatto
          if (updated.numeroOrdineId) {
            const schedaId = updated.numeroOrdineId;
            const tuttiRitiri = await getRitiriByScheda(schedaId);
            // Movimento collegato a un giro: contano solo i movimenti dello stesso giro e tipo
            // (la Consegna del giro 2 non deve aspettare il Ritiro, ancora da fare, del giro 1
            // né quello del suo stesso giro). Senza giro vale la regola storica: tutti i ritiri.
            const daVerificare = updated.giroId
              ? tuttiRitiri.filter(r => r.giroId === updated.giroId && r.tipoMovimento === updated.tipoMovimento)
              : tuttiRitiri;
            if (!daVerificare.every(r => r.stato === "Fatto")) return;

            if (updated.tipoMovimento === "Ritiro") {
              const giroRientro = updated.giroId ?? await getGiroAttivoId(schedaId);
              await updateSchedaRientrato(schedaId, updated.giroId);
              revalidatePath("/schede");
              await notificaRientroGiro(giroRientro, contestoNotifica);
            } else if (updated.tipoMovimento === "Consegna") {
              await updateSchedaConsegnaFatta(schedaId, updated.giroId);
              revalidatePath("/schede");
            }
          }
        } catch (e) {
          console.error("[PATCH ritiri] aggiornamento scheda post-completamento:", e);
        }
      })();
    }

    revalidatePath("/ritiri");
    if (isNC || effectiveSchedaId) { revalidatePath("/schede"); }

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

    // Admin e logistica possono eliminare record (stesse autorizzazioni su Ritiri e Consegne)
    if (!session || (session.role !== "admin" && session.role !== "logistica")) {
      return NextResponse.json({ error: "Permesso negato — solo admin e logistica possono eliminare record" }, { status: 403 });
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
