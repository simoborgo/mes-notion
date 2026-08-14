import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSchedaById } from "@/lib/schedeRepository";
import { getRitiri, createRitiro, getRitiroById, appendFotoToRitiro, createRilavorazione } from "@/lib/ritiriRepository";
import { getSessionFromRequest, RITIRI_CREATE_ROLES, RITIRI_PICKUP_RILAVORAZIONE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET() {
  try {
    const ritiri = await getRitiri();
    return NextResponse.json(ritiri);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero ritiri" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }
    const body = await req.json();
    const { causale, tipoMovimento, dataTrasporto, urgenza, nc, nrCollo, totColli, schedaId, fornitoreId, commessaId, foto_base64 } = body;
    if (!causale?.trim()) {
      return NextResponse.json({ error: "Descrizione obbligatoria" }, { status: 400 });
    }

    // NC + Consegna + Scheda collegata → crea anche la Rilavorazione (come da Carico
    // Magazzino): la scheda madre passa a "In Attesa Rilavorazione" e il ritiro creato
    // qui si collega alla rilavorazione (non più direttamente alla scheda).
    const isNC = nc === true && tipoMovimento === "Consegna" && !!schedaId;
    let finalSchedaId: string | null = schedaId || null;
    let rilavorazioneId: string | null = null;

    // Se schedaId punta a una Rilavorazione già esistente (non creata ora via NC — es.
    // "Inserisci un ritiro" da Rientro Qualità per organizzare il ritiro di una
    // rilavorazione già aperta), va collegata anche la relation "Rilavorazione": la
    // pagina Rientro Qualità raggruppa i ritiri concordati solo per quella relation, non
    // per "Scheda" — senza questo il movimento risulterebbe creato ma mai "concordato".
    let schedaCollegataERilavorazione = false;
    if (!isNC && schedaId) {
      try {
        const target = await getSchedaById(schedaId);
        if (target.tipologia === "Rilavorazione") {
          rilavorazioneId = schedaId;
          schedaCollegataERilavorazione = true;
        }
      } catch {
        // schedaId non valido: lascia proseguire, sarà Notion a segnalare l'errore sulla relation "Scheda"
      }
    }

    // Fuori da RITIRI_CREATE_ROLES (admin/logistica/produzione), l'unica azione consentita è
    // organizzare il ritiro di una Rilavorazione già aperta e in attesa (pulsante "Inserisci
    // un ritiro" di Rientro Qualità) — mai la creazione libera di un Ritiro/Consegna qualsiasi.
    const puoScrivereLiberamente = RITIRI_CREATE_ROLES.includes(session.role);
    const puoOrganizzarePickupRilavorazione = !isNC && schedaCollegataERilavorazione && RITIRI_PICKUP_RILAVORAZIONE_ROLES.includes(session.role);
    if (!puoScrivereLiberamente && !puoOrganizzarePickupRilavorazione) {
      return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
    }

    if (isNC) {
      try {
        const parentScheda = await getSchedaById(schedaId);
        const descrizioneRilavorazione = `Rilavorazione NC - ${parentScheda.numeroScheda || parentScheda.odp}`;
        const result = await createRilavorazione({
          parentId: schedaId,
          descrizione: descrizioneRilavorazione,
          fornitoreId: fornitoreId || null,
          dataRientro: dataTrasporto || null,
          creaRitiro: false,
          parent: parentScheda,
        });
        rilavorazioneId = result.rilavorazione.id;
        // Il movimento si collega alla rilavorazione appena creata (non più al padre):
        // così l'ODP/Commessa mostrato è quello della rilavorazione, che è la scheda
        // da cui parte la logica di rientro/Segna Rientrata
        finalSchedaId = rilavorazioneId;
      } catch (e) {
        console.error("[ritiri POST] createRilavorazione error:", e);
        return NextResponse.json(
          { error: "Impossibile creare la Rilavorazione su Notion" },
          { status: 502 }
        );
      }
    }

    const ritiro = await createRitiro({
      causale: causale.trim(),
      tipoMovimento,
      dataTrasporto: dataTrasporto || null,
      urgenza: urgenza ?? false,
      nc: nc ?? false,
      nrCollo: nrCollo != null ? Number(nrCollo) : null,
      totColli: totColli != null ? Number(totColli) : null,
      schedaId: finalSchedaId,
      fornitoreId: fornitoreId || null,
      commessaId: commessaId || null,
      rilavorazioneId,
    });

    const fotoArray: string[] = Array.isArray(foto_base64) ? foto_base64 : foto_base64 ? [foto_base64] : [];
    let ritiroFinale = ritiro;
    if (fotoArray.length) {
      try {
        await appendFotoToRitiro(ritiro.id, fotoArray);
        // Rilegge la pagina per ottenere le URL firmate delle foto appena caricate
        ritiroFinale = await getRitiroById(ritiro.id);
      } catch (e) {
        console.error("[ritiri POST] appendFoto:", e);
        // Upload foto fallito: ritorna comunque il ritiro (senza foto)
      }
    }

    void logOperation(
      session?.name ?? "Sconosciuto",
      "CREATE",
      "ritiro",
      ritiro.id,
      { causale: causale.trim(), tipoMovimento, dataTrasporto, urgenza, schedaId, fornitoreId }
    );

    revalidatePath("/ritiri");
    if (isNC || schedaId) { revalidatePath("/schede"); }
    return NextResponse.json(ritiroFinale, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore creazione ritiro" }, { status: 500 });
  }
}
