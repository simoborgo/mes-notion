import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getTranciatoById, aggiornaGiacenzaTranciato, segnalaMovimentoTranciato } from "@/lib/tranciatiRepository";
import { registraMovimento } from "@/lib/magazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_TRANCIATI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_TRANCIATI_ROLES.includes(session.role)) {
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

  const tranciato = await getTranciatoById(id);
  if (!tranciato.attivo) {
    return NextResponse.json({ error: "Tranciato non attivo" }, { status: 400 });
  }

  const giacenzaPrecedente = tranciato.giacenzaAttuale;
  const giacenzaRisultante = giacenzaPrecedente - quantita;
  if (giacenzaRisultante < 0) {
    return NextResponse.json({ error: `Giacenza insufficiente (disponibile: ${giacenzaPrecedente})` }, { status: 400 });
  }
  const note = typeof body.note === "string" && body.note ? body.note : null;

  await aggiornaGiacenzaTranciato(id, giacenzaRisultante);

  await registraMovimento({
    categoria: "tranciati",
    entitaId: id,
    codice: tranciato.essenza,
    tipo: "scarico",
    quantita,
    giacenzaPrecedente,
    giacenzaRisultante,
    operatore: session.name,
    note,
  });
  await segnalaMovimentoTranciato(id);

  void logOperation(session.name, "UPDATE", "movimento_magazzino", id, { categoria: "tranciati", tipo: "scarico", quantita, giacenzaRisultante });

  revalidatePath("/magazzino/tranciati");

  return NextResponse.json({ ok: true, giacenzaRisultante });
}
