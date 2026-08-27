import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getProfiloMetallicoById, aggiornaGiacenzaProfiloMetallico, segnalaMovimentoProfiloMetallico } from "@/lib/profiliMetalliciRepository";
import { registraMovimento } from "@/lib/magazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_PROFILI_METALLICI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_PROFILI_METALLICI_ROLES.includes(session.role)) {
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

  const profilo = await getProfiloMetallicoById(id);
  if (!profilo.attivo) {
    return NextResponse.json({ error: "Profilo non attivo" }, { status: 400 });
  }

  const giacenzaPrecedente = profilo.giacenzaAttuale;
  const giacenzaRisultante = giacenzaPrecedente - quantita;
  if (giacenzaRisultante < 0) {
    return NextResponse.json({ error: `Giacenza insufficiente (disponibile: ${giacenzaPrecedente})` }, { status: 400 });
  }
  const note = typeof body.note === "string" && body.note ? body.note : null;

  await aggiornaGiacenzaProfiloMetallico(id, giacenzaRisultante);

  await registraMovimento({
    categoria: "profili_metallici",
    entitaId: id,
    codice: profilo.tipoProfilo,
    tipo: "scarico",
    quantita,
    giacenzaPrecedente,
    giacenzaRisultante,
    operatore: session.name,
    note,
  });
  await segnalaMovimentoProfiloMetallico(id);

  void logOperation(session.name, "UPDATE", "movimento_magazzino", id, { categoria: "profili_metallici", tipo: "scarico", quantita, giacenzaRisultante });

  revalidatePath("/magazzino/profili-metallici");

  return NextResponse.json({ ok: true, giacenzaRisultante });
}
