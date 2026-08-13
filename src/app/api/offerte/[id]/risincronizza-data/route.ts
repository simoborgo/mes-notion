import { NextRequest, NextResponse } from "next/server";
import { getOffertaConRighe, aggiornaCampiOfferta } from "@/lib/offerteRepository";
import { getCommessaById } from "@/lib/commesseRepository";
import { getSessionFromRequest, OFFERTE_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Risincronizzazione manuale (opzione (c) scelta con l'utente 2026-08-06): data_consegna_prevista
// viene congelata una volta sola alla conferma dell'offerta — se la Commessa collegata viene
// riprogrammata dopo, il Previsionale continua a usare la data vecchia finché qualcuno non preme
// questo bottone. getCommessaById fa un pages.retrieve diretto (non la cache array di getSchede),
// quindi qui il dato è sempre fresco, nessun problema di propagazione.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !OFFERTE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  const { id } = await params;

  const risultato = await getOffertaConRighe(id).catch(() => null);
  if (!risultato) return NextResponse.json({ error: "Offerta non trovata" }, { status: 404 });
  const { offerta } = risultato;

  if (offerta.stato !== "Confermata" || !offerta.commessaId) {
    return NextResponse.json({ error: "Risincronizzabile solo per offerte Confermate collegate a una Commessa" }, { status: 400 });
  }

  let commessa;
  try {
    commessa = await getCommessaById(offerta.commessaId);
  } catch (e) {
    console.error("[offerte/[id]/risincronizza-data]", e);
    return NextResponse.json({ error: "Impossibile leggere la Commessa collegata da Notion" }, { status: 502 });
  }

  if (!commessa.dataCarico || commessa.dataCarico === offerta.dataConsegnaPrevista) {
    return NextResponse.json({ offerta, cambiata: false });
  }

  const dataPrecedente = offerta.dataConsegnaPrevista;
  const aggiornata = await aggiornaCampiOfferta(id, { dataConsegnaPrevista: commessa.dataCarico });
  void logOperation(session.name, "UPDATE", "offerta", id, { azione: "risincronizza-data", da: dataPrecedente, a: commessa.dataCarico });
  return NextResponse.json({ offerta: aggiornata, cambiata: true, dataPrecedente });
}
