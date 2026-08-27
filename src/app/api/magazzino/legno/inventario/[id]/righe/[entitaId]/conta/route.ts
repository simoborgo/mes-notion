import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getLegnoById, aggiornaGiacenzaLegno, risolviSegnalazioneLegno } from "@/lib/legnoRepository";
import { registraMovimento } from "@/lib/magazzinoRepository";
import { getInventarioById, getRigaInventario, registraConteggio } from "@/lib/inventarioMagazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_LEGNO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; entitaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_LEGNO_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { id, entitaId } = await params;
  let body: { giacenzaContata?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  if (typeof body.giacenzaContata !== "number" || body.giacenzaContata < 0) {
    return NextResponse.json({ error: "Quantità contata non valida" }, { status: 400 });
  }

  const sessione = await getInventarioById(id);
  if (!sessione || sessione.stato !== "aperto") {
    return NextResponse.json({ error: "Inventario non trovato o già chiuso" }, { status: 404 });
  }
  const riga = await getRigaInventario(id, entitaId);
  if (!riga) {
    return NextResponse.json({ error: "Legno non incluso in questo inventario" }, { status: 404 });
  }

  const legno = await getLegnoById(entitaId);
  const giacenzaPrecedente = legno.giacenzaAttuale;
  const delta = body.giacenzaContata - giacenzaPrecedente;

  let movimentoId: string | null = null;
  if (delta !== 0) {
    await aggiornaGiacenzaLegno(entitaId, body.giacenzaContata);
    const movimento = await registraMovimento({
      categoria: "legno",
      entitaId,
      codice: legno.essenza,
      tipo: "rettifica",
      quantita: delta,
      giacenzaPrecedente,
      giacenzaRisultante: body.giacenzaContata,
      operatore: session.name,
    });
    movimentoId = movimento.id;
  }

  const rigaAggiornata = await registraConteggio(id, entitaId, {
    giacenzaContata: body.giacenzaContata,
    operatore: session.name,
    movimentoId,
  });
  await risolviSegnalazioneLegno(entitaId);

  void logOperation(session.name, "UPDATE", "inventario_magazzino", id, { categoria: "legno", entitaId, giacenzaContata: body.giacenzaContata, delta });
  revalidatePath(`/magazzino/legno/inventario/${id}`);

  return NextResponse.json({ ok: true, riga: rigaAggiornata, delta });
}
