import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSchedaById, createSchedaPage } from "@/lib/schedeRepository";
import { getSessionFromRequest, MODIFICA_SCHEDA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MODIFICA_SCHEDA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const numeroScheda = typeof body.numeroScheda === "string" ? body.numeroScheda.trim() : "";
  if (!numeroScheda) {
    return NextResponse.json({ error: "Numero Scheda obbligatorio" }, { status: 400 });
  }

  try {
    const padre = await getSchedaById(id);

    const sottoscheda = await createSchedaPage({
      numeroScheda,
      commessaId: padre.commessaId,
      odp: padre.odp,
      tipologia: "Sottoscheda",
      stato: "Da Iniziare",
      parentId: id,
      codiceArticolo: body.codiceArticolo || null,
      posizione: body.posizione || null,
      quantita: body.quantita != null && body.quantita !== "" ? Number(body.quantita) : null,
      dataProduzionePrevista: body.dataProduzionePrevista || null,
      note: body.note || null,
    });

    revalidatePath("/schede");

    void logOperation(session.name, "CREATE", "scheda", sottoscheda.id, { ...body, tipologia: "Sottoscheda", parentId: id });

    return NextResponse.json(sottoscheda);
  } catch (e) {
    console.error("[schede/[id]/sottoscheda POST]", e);
    return NextResponse.json({ error: "Errore creazione sottoscheda" }, { status: 500 });
  }
}
