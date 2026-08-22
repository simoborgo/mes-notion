import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getVerniceById, aggiornaGiacenzaVernice, risolviSegnalazioneVernice } from "@/lib/verniciRepository";
import { registraMovimento } from "@/lib/magazzinoRepository";
import { getInventarioById, getRigaInventario, registraConteggio } from "@/lib/inventarioMagazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; entitaId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_VERNICI_ROLES.includes(session.role)) {
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
    return NextResponse.json({ error: "Vernice non incluso in questo inventario" }, { status: 404 });
  }

  // Il delta va sempre calcolato contro la giacenza fresca, non contro lo snapshot teorico
  // preso all'apertura — altrimenti movimenti nel frattempo verrebbero cancellati.
  const vernice = await getVerniceById(entitaId);
  const giacenzaPrecedente = vernice.giacenzaAttuale;
  const delta = body.giacenzaContata - giacenzaPrecedente;

  let movimentoId: string | null = null;
  if (delta !== 0) {
    await aggiornaGiacenzaVernice(entitaId, body.giacenzaContata);
    const movimento = await registraMovimento({
      categoria: "vernici",
      entitaId,
      codice: vernice.coloreCodice,
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
  // Unica verifica fisica che risolve il flag "da verificare" — un carico/scarico successivo
  // non lo azzera più (2026-08-22).
  await risolviSegnalazioneVernice(entitaId);

  void logOperation(session.name, "UPDATE", "inventario_magazzino", id, { categoria: "vernici", entitaId, giacenzaContata: body.giacenzaContata, delta });
  revalidatePath(`/verniciatura/magazzino/inventario/${id}`);

  return NextResponse.json({ ok: true, riga: rigaAggiornata, delta });
}
