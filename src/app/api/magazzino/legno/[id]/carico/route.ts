import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getLegnoById, aggiornaGiacenzaLegno, segnalaMovimentoLegno } from "@/lib/legnoRepository";
import { registraMovimento } from "@/lib/magazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_LEGNO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_LEGNO_ROLES.includes(session.role)) {
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

  const legno = await getLegnoById(id);
  if (!legno.attivo) {
    return NextResponse.json({ error: "Legno non attivo" }, { status: 400 });
  }

  const giacenzaPrecedente = legno.giacenzaAttuale;
  const giacenzaRisultante = giacenzaPrecedente + quantita;
  const note = typeof body.note === "string" && body.note ? body.note : null;

  await aggiornaGiacenzaLegno(id, giacenzaRisultante);

  await registraMovimento({
    categoria: "legno",
    entitaId: id,
    codice: legno.essenza,
    tipo: "carico",
    quantita,
    giacenzaPrecedente,
    giacenzaRisultante,
    operatore: session.name,
    note,
  });
  await segnalaMovimentoLegno(id);

  void logOperation(session.name, "UPDATE", "movimento_magazzino", id, { categoria: "legno", tipo: "carico", quantita, giacenzaRisultante });

  revalidatePath("/magazzino/legno");

  return NextResponse.json({ ok: true, giacenzaRisultante });
}
