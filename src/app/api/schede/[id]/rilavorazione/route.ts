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
  try {
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

    if (!parent.commessaId) {
      return NextResponse.json({ ok: false, error: "Scheda non collegata a una commessa" }, { status: 422 });
    }

    const [subOdp, fornitoreId] = await Promise.all([
      getNextRilavorazioneOdp(parentId, parent.odp),
      body.fornitoreNome ? findFornitoreIdByName(body.fornitoreNome) : Promise.resolve(null),
    ]);

    const rilavorazione = await createSchedaPage({
      numeroScheda: body.descrizione.trim(),
      commessaId: parent.commessaId,
      odp: subOdp,
      tipologia: "Rilavorazione",
      stato: "In Lavorazione Esterna",
      fornitore: body.fornitoreNome ?? null,
      fornitoreId,
      note: body.note ?? null,
      dataProduzionePrevista: body.dataRientro ?? null,
      parentId,
    });

    await updateSchedaStato(parentId, "In Attesa Rilavorazione");

    revalidatePath("/schede");

    return NextResponse.json({ ok: true, odp: rilavorazione.odp, pageId: rilavorazione.id });
  } catch (err) {
    console.error("[rilavorazione] error:", err);
    return NextResponse.json({ ok: false, error: (err as Error).message ?? "Errore interno" }, { status: 500 });
  }
}
