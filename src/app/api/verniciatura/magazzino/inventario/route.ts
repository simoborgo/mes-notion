import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getVernici } from "@/lib/verniciRepository";
import { apriInventario, type AmbitoMagazzinoVernici } from "@/lib/inventarioMagazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// "tipologia"/"colore_codice" rimossi dall'apertura (2026-08-22, su richiesta dell'utente —
// troppe opzioni per un uso pratico): restano "tutto", "movimentate" e "libero". Il vincolo DB
// resta permissivo per compatibilità storica con inventari chiusi già salvati con quegli ambiti.
const AMBITI: AmbitoMagazzinoVernici[] = ["tutto", "movimentate", "libero"];

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_VERNICI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  let body: { ambito?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  const ambito = (body.ambito ?? "tutto") as AmbitoMagazzinoVernici;
  if (!AMBITI.includes(ambito)) {
    return NextResponse.json({ error: "Ambito non valido" }, { status: 400 });
  }

  // "libero" parte sempre vuoto: le righe si aggiungono una a una dopo l'apertura
  // (POST .../righe), non tutte insieme come per gli altri ambiti.
  let inScope: Awaited<ReturnType<typeof getVernici>> = [];
  if (ambito !== "libero") {
    const tutte = await getVernici({ soloAttivi: true });
    inScope = ambito === "movimentate" ? tutte.filter(v => v.segnalataUsoIl != null) : tutte;

    if (inScope.length === 0) {
      const msg = ambito === "movimentate" ? "Nessuna vernice segnalata come movimentata — niente da verificare" : "Nessuna vernice nell'ambito selezionato";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  try {
    const sessione = await apriInventario({
      categoria: "vernici",
      ambito,
      ambitoValore: null,
      operatore: session.name,
      righe: inScope.map(v => ({
        entitaId: v.id,
        codice: v.coloreCodice,
        descrizione: v.descrizioneColore ?? v.tipologia,
        giacenzaTeorica: v.giacenzaAttuale,
      })),
    });
    void logOperation(session.name, "CREATE", "inventario_magazzino", sessione.id, { categoria: "vernici", ambito, articoli: inScope.length });
    revalidatePath("/verniciatura/magazzino/inventario");
    return NextResponse.json(sessione);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
