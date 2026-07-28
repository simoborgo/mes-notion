import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getArticoloFerramentaById, updateArticoloFerramentaGiacenza } from "@/lib/articoliFerramentaRepository";
import { registraMovimento } from "@/lib/ferramentaRepository";
import { getInventarioById, getRigaInventario, registraConteggio } from "@/lib/inventarioFerramentaRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; articoloId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { id, articoloId } = await params;
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
  const riga = await getRigaInventario(id, articoloId);
  if (!riga) {
    return NextResponse.json({ error: "Articolo non incluso in questo inventario" }, { status: 404 });
  }

  // Il delta va sempre calcolato contro la giacenza Notion fresca, non contro lo
  // snapshot teorico preso all'apertura — altrimenti movimenti nel frattempo verrebbero cancellati.
  const articolo = await getArticoloFerramentaById(articoloId);
  const giacenzaPrecedente = articolo.giacenzaAttuale;
  const delta = body.giacenzaContata - giacenzaPrecedente;

  let movimentoId: string | null = null;
  if (delta !== 0) {
    await updateArticoloFerramentaGiacenza(articoloId, body.giacenzaContata);
    const movimento = await registraMovimento({
      articoloId,
      codiceOs1: articolo.codiceOs1 || null,
      tipo: "rettifica",
      quantita: delta,
      giacenzaPrecedente,
      giacenzaRisultante: body.giacenzaContata,
      operatore: session.name,
      fonte: "mes",
    });
    movimentoId = movimento.id;
  }

  const rigaAggiornata = await registraConteggio(id, articoloId, {
    giacenzaContata: body.giacenzaContata,
    operatore: session.name,
    movimentoId,
  });

  void logOperation(session.name, "UPDATE", "inventario_ferramenta", id, { articoloId, giacenzaContata: body.giacenzaContata, delta });
  revalidatePath(`/ferramenta/inventario/${id}`);

  return NextResponse.json({ ok: true, riga: rigaAggiornata, delta });
}
