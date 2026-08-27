import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getBordi } from "@/lib/bordiRepository";
import { apriInventario } from "@/lib/inventarioMagazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_BORDI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

// Solo ambito "tutto" in questa prima fase per Bordi (nessun selettore in UI) — ambiti avanzati
// (per materiale/decor, inventario libero) aggiungibili dopo se richiesti, stesso pattern Vernici.
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_BORDI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const tutti = await getBordi({ soloAttivi: true });
  if (tutti.length === 0) {
    return NextResponse.json({ error: "Nessun bordo attivo da inventariare" }, { status: 400 });
  }

  try {
    const sessione = await apriInventario({
      categoria: "bordi",
      ambito: "tutto",
      ambitoValore: null,
      operatore: session.name,
      righe: tutti.map(b => ({
        entitaId: b.id,
        codice: b.decorCodice,
        descrizione: b.decorNome ?? b.materiale,
        giacenzaTeorica: b.giacenzaAttuale,
      })),
    });
    void logOperation(session.name, "CREATE", "inventario_magazzino", sessione.id, { categoria: "bordi", ambito: "tutto", articoli: tutti.length });
    revalidatePath("/magazzino/bordi/inventario");
    return NextResponse.json(sessione);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
