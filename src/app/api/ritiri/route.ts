import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getRitiri, createRitiro, getRitiroById, appendFotoToPage, getSchedaById, createRilavorazione } from "@/lib/notion";
import { getSessionFromRequest, WRITE_ROLES } from "@/lib/auth";
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
    if (!session || !WRITE_ROLES.includes(session.role)) {
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
        await appendFotoToPage(ritiro.id, fotoArray);
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
    if (isNC || schedaId) revalidatePath("/schede");
    return NextResponse.json(ritiroFinale, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore creazione ritiro" }, { status: 500 });
  }
}
