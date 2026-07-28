import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getArticoloFerramentaById, updateArticoloFerramentaGiacenza } from "@/lib/articoliFerramentaRepository";
import { registraMovimento } from "@/lib/ferramentaRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }

  const quantita = Number(body.quantita);
  if (!quantita || quantita <= 0) {
    return NextResponse.json({ error: "Quantità mancante o non valida" }, { status: 400 });
  }

  const articolo = await getArticoloFerramentaById(id);
  const giacenzaPrecedente = articolo.giacenzaAttuale;
  const giacenzaRisultante = giacenzaPrecedente + quantita;

  await updateArticoloFerramentaGiacenza(id, giacenzaRisultante);

  await registraMovimento({
    articoloId: id,
    codiceOs1: articolo.codiceOs1 || null,
    tipo: "carico",
    quantita,
    giacenzaPrecedente,
    giacenzaRisultante,
    operatore: session.name,
    fonte: "mes",
  });

  void logOperation(session.name, "UPDATE", "articolo_ferramenta", id, { tipo: "carico", quantita, giacenzaRisultante });

  revalidatePath("/ferramenta");
  revalidatePath("/admin/ferramenta");

  return NextResponse.json({ ok: true, giacenzaRisultante });
}
