import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getVerniceById, segnalaMovimentoVernice } from "@/lib/verniciRepository";
import { registraMovimento } from "@/lib/magazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Movimento "leggero": l'operatore dichiara di aver usato la vernice senza ripesarla/contarla
// (niente carico/scarico preciso). Non tocca la giacenza — segna solo la vernice come "da
// verificare al prossimo inventario" (vernici.segnalata_uso_il), stessa logica di un vero
// carico/scarico ma senza richiedere una quantità. Deciso con l'utente 2026-08-22.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_VERNICI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { id } = await params;
  // Nessun campo è obbligatorio qui (a differenza di carico/scarico): il bottone "Ho usato
  // questa vernice" non manda alcun body, quindi un payload assente/vuoto è legittimo, non un
  // errore — a differenza delle altre route di questo modulo che richiedono sempre un JSON.
  const body: Record<string, unknown> = await req.json().catch(() => ({}));
  const note = typeof body.note === "string" && body.note ? body.note : null;

  const vernice = await getVerniceById(id);
  if (!vernice.attivo) {
    return NextResponse.json({ error: "Vernice non attiva" }, { status: 400 });
  }

  await registraMovimento({
    categoria: "vernici",
    entitaId: id,
    codice: vernice.coloreCodice,
    tipo: "segnalazione",
    quantita: 0,
    giacenzaPrecedente: vernice.giacenzaAttuale,
    giacenzaRisultante: vernice.giacenzaAttuale,
    operatore: session.name,
    note,
  });
  await segnalaMovimentoVernice(id);

  void logOperation(session.name, "UPDATE", "movimento_magazzino", id, { categoria: "vernici", tipo: "segnalazione", note });

  revalidatePath("/verniciatura/magazzino");

  return NextResponse.json({ ok: true });
}
