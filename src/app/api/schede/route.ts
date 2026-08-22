import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSchede, getNextOdp, createSchedaPage } from "@/lib/schedeRepository";
import { getSessionFromRequest, MODIFICA_SCHEDA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET() {
  try {
    const schede = await getSchede();
    return NextResponse.json(schede);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore nel recupero schede" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !MODIFICA_SCHEDA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const numeroScheda = typeof body.numeroScheda === "string" ? body.numeroScheda.trim() : "";
  if (!numeroScheda) {
    return NextResponse.json({ error: "Numero Scheda obbligatorio" }, { status: 400 });
  }

  try {
    const odp = await getNextOdp();
    const scheda = await createSchedaPage({
      numeroScheda,
      commessaId: typeof body.commessaId === "string" && body.commessaId ? body.commessaId : null,
      odp,
      tipologia: "Scheda",
      stato: "Da Iniziare",
      codiceArticolo: body.codiceArticolo || null,
      posizione: body.posizione || null,
      quantita: body.quantita != null && body.quantita !== "" ? Number(body.quantita) : null,
      dataProduzionePrevista: body.dataProduzionePrevista || null,
      dataSchedaRicevuta: body.dataSchedaRicevuta || null,
      produzioneEsterna: body.produzioneEsterna ?? undefined,
      note: body.note || null,
      areaId: typeof body.areaId === "string" && body.areaId ? body.areaId : null,
    });

    revalidatePath("/schede");

    void logOperation(session.name, "CREATE", "scheda", scheda.id, body as Record<string, unknown>);

    return NextResponse.json(scheda);
  } catch (e) {
    console.error("[schede POST]", e);
    return NextResponse.json({ error: "Errore creazione scheda" }, { status: 500 });
  }
}
