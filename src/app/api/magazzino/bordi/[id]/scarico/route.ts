import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getBordoById, aggiornaGiacenzaBordo, segnalaMovimentoBordo } from "@/lib/bordiRepository";
import { registraMovimento } from "@/lib/magazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_BORDI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_BORDI_ROLES.includes(session.role)) {
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

  const bordo = await getBordoById(id);
  if (!bordo.attivo) {
    return NextResponse.json({ error: "Bordo non attivo" }, { status: 400 });
  }

  const giacenzaPrecedente = bordo.giacenzaAttuale;
  const giacenzaRisultante = giacenzaPrecedente - quantita;
  // Nessuna soglia/riordino da monitorare per Bordi: uno scarico che porti sotto zero sarebbe
  // solo dato sporco fino al prossimo inventario, quindi si blocca subito (stesso pattern Vernici).
  if (giacenzaRisultante < 0) {
    return NextResponse.json({ error: `Giacenza insufficiente (disponibile: ${giacenzaPrecedente})` }, { status: 400 });
  }
  const note = typeof body.note === "string" && body.note ? body.note : null;

  await aggiornaGiacenzaBordo(id, giacenzaRisultante);

  await registraMovimento({
    categoria: "bordi",
    entitaId: id,
    codice: bordo.decorCodice,
    tipo: "scarico",
    quantita,
    giacenzaPrecedente,
    giacenzaRisultante,
    operatore: session.name,
    note,
  });
  await segnalaMovimentoBordo(id);

  void logOperation(session.name, "UPDATE", "movimento_magazzino", id, { categoria: "bordi", tipo: "scarico", quantita, giacenzaRisultante });

  revalidatePath("/magazzino/bordi");

  return NextResponse.json({ ok: true, giacenzaRisultante });
}
