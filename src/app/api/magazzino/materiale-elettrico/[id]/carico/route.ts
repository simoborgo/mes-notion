import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getArticoloElettricoById, aggiornaGiacenzaArticoloElettrico, segnalaMovimentoArticoloElettrico } from "@/lib/materialeElettricoRepository";
import { registraMovimento } from "@/lib/magazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_MATERIALE_ELETTRICO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_MATERIALE_ELETTRICO_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }

  const quantita = Number(body.quantita);
  if (!quantita || quantita <= 0) {
    return NextResponse.json({ error: "Quantità mancante o non valida" }, { status: 400 });
  }

  const articolo = await getArticoloElettricoById(id);
  if (!articolo.attivo) {
    return NextResponse.json({ error: "Articolo non attivo" }, { status: 400 });
  }

  const giacenzaPrecedente = articolo.giacenzaAttuale;
  const giacenzaRisultante = giacenzaPrecedente + quantita;
  const note = typeof body.note === "string" && body.note ? body.note : null;

  await aggiornaGiacenzaArticoloElettrico(id, giacenzaRisultante);

  await registraMovimento({
    categoria: "materiale_elettrico",
    entitaId: id,
    codice: articolo.tipoArticolo,
    tipo: "carico",
    quantita,
    giacenzaPrecedente,
    giacenzaRisultante,
    operatore: session.name,
    note,
  });
  await segnalaMovimentoArticoloElettrico(id);

  void logOperation(session.name, "UPDATE", "movimento_magazzino", id, { categoria: "materiale_elettrico", tipo: "carico", quantita, giacenzaRisultante });

  revalidatePath("/magazzino/materiale-elettrico");

  return NextResponse.json({ ok: true, giacenzaRisultante });
}
