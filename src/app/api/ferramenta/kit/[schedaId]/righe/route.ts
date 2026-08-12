import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { addDistintaRiga } from "@/lib/kitFerramentaRepository";
import { getArticoloFerramentaById } from "@/lib/articoliFerramentaRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ schedaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { schedaId } = await params;
  let body: { articoloId?: string; descrizione?: string; quantita?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  const descrizioneLibera = body.descrizione?.trim();
  if (!body.articoloId && !descrizioneLibera) {
    return NextResponse.json({ error: "Seleziona un articolo o scrivi una descrizione" }, { status: 400 });
  }
  if (!(Number(body.quantita) > 0)) {
    return NextResponse.json({ error: "Quantità obbligatoria (> 0)" }, { status: 400 });
  }

  if (body.articoloId) {
    const articolo = await getArticoloFerramentaById(body.articoloId);
    if (!articolo.attivo || articolo.metodoGestione !== "A Pezzo") {
      return NextResponse.json({ error: "Il kit accetta solo articoli attivi con metodo 'A Pezzo'" }, { status: 400 });
    }
  }

  const riga = await addDistintaRiga({
    odpId: schedaId,
    articoloId: body.articoloId ?? null,
    descrizione: descrizioneLibera ?? null,
    quantita: Number(body.quantita),
  });
  void logOperation(session.name, "CREATE", "kit_ferramenta", schedaId, { articoloId: body.articoloId, descrizione: descrizioneLibera, quantita: body.quantita });
  revalidatePath(`/admin/ferramenta/kit/${schedaId}`);
  return NextResponse.json(riga);
}
