import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getVerniceById, aggiornaGiacenzaVernice } from "@/lib/verniciRepository";
import { registraMovimento } from "@/lib/magazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_VERNICI_ROLES.includes(session.role)) {
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

  const vernice = await getVerniceById(id);
  if (!vernice.attivo) {
    return NextResponse.json({ error: "Vernice non attiva" }, { status: 400 });
  }

  const giacenzaPrecedente = vernice.giacenzaAttuale;
  const giacenzaRisultante = giacenzaPrecedente + quantita;
  const note = typeof body.note === "string" && body.note ? body.note : null;

  await aggiornaGiacenzaVernice(id, giacenzaRisultante);

  await registraMovimento({
    categoria: "vernici",
    entitaId: id,
    codice: vernice.coloreCodice,
    tipo: "carico",
    quantita,
    giacenzaPrecedente,
    giacenzaRisultante,
    operatore: session.name,
    note,
  });

  void logOperation(session.name, "UPDATE", "movimento_magazzino", id, { categoria: "vernici", tipo: "carico", quantita, giacenzaRisultante });

  revalidatePath("/verniciatura/magazzino");

  return NextResponse.json({ ok: true, giacenzaRisultante });
}
