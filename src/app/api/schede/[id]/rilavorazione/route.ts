import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionFromRequest } from "@/lib/auth";
import {
  getSchedaById,
  createSchedaPage,
  updateSchedaStato,
  findFornitoreIdByName,
  getNextRilavorazioneOdp,
} from "@/lib/notion";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });

  const { id: parentId } = await params;
  const body = (await req.json()) as {
    descrizione: string;
    fornitoreNome?: string;
    note?: string;
    dataRientro?: string;
  };

  if (!body.descrizione?.trim()) {
    return NextResponse.json({ ok: false, error: "Descrizione obbligatoria" }, { status: 400 });
  }

  const parent = await getSchedaById(parentId);

  const subOdp = await getNextRilavorazioneOdp(parentId, parent.odp);
  const fornitoreId = body.fornitoreNome ? await findFornitoreIdByName(body.fornitoreNome) : null;

  const rilavorazione = await createSchedaPage({
    numeroScheda: body.descrizione.trim(),
    commessaId: parent.commessaId!,
    odp: subOdp,
    tipologia: "Rilavorazione",
    stato: "In Lavorazione Esterna",
    fornitore: body.fornitoreNome ?? null,
    fornitoreId,
    dataProduzionePrevista: body.dataRientro ?? null,
    parentId,
  });

  if (body.note?.trim()) {
    // note non è un campo di createSchedaPage — aggiorniamo a parte tramite notion SDK
    const { Client } = await import("@notionhq/client");
    const notion = new Client({ auth: process.env.NOTION_TOKEN! });
    await notion.pages.update({
      page_id: rilavorazione.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: { Note: { rich_text: [{ text: { content: body.note.trim() } }] } } as any,
    });
  }

  await updateSchedaStato(parentId, "In Attesa Rilavorazione");

  revalidatePath("/schede");

  return NextResponse.json({ ok: true, rilavorazione });
}
