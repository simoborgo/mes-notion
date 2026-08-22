import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getVerniceById } from "@/lib/verniciRepository";
import { getInventarioById, aggiungiRigaInventario } from "@/lib/inventarioMagazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Aggiunge UNA vernice a una sessione di inventario "libero" già aperta — solo per quell'ambito:
// gli altri (tutto/movimentate) hanno già tutte le righe decise all'apertura, aggiungerne altre
// dopo non avrebbe senso (il conteggio finale non corrisponderebbe più al filtro scelto).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_VERNICI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const { id } = await params;
  let body: { verniceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  if (!body.verniceId) {
    return NextResponse.json({ error: "verniceId obbligatorio" }, { status: 400 });
  }

  const sessione = await getInventarioById(id);
  if (!sessione || sessione.stato !== "aperto") {
    return NextResponse.json({ error: "Inventario non trovato o già chiuso" }, { status: 404 });
  }
  if (sessione.ambito !== "libero") {
    return NextResponse.json({ error: "Si possono aggiungere righe solo a un inventario libero" }, { status: 400 });
  }

  let vernice;
  try {
    vernice = await getVerniceById(body.verniceId);
  } catch {
    return NextResponse.json({ error: "Vernice non trovata" }, { status: 404 });
  }
  if (!vernice.attivo) {
    return NextResponse.json({ error: "Vernice non attiva" }, { status: 400 });
  }

  const riga = await aggiungiRigaInventario(id, {
    entitaId: vernice.id,
    codice: vernice.coloreCodice,
    descrizione: vernice.descrizioneColore ?? vernice.tipologia,
    giacenzaTeorica: vernice.giacenzaAttuale,
  });

  void logOperation(session.name, "UPDATE", "inventario_magazzino", id, { categoria: "vernici", azione: "aggiungi_riga", verniceId: vernice.id });
  revalidatePath(`/verniciatura/magazzino/inventario/${id}`);

  return NextResponse.json({ ok: true, riga, vernice });
}
