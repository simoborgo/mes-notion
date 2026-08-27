import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getLegni } from "@/lib/legnoRepository";
import { apriInventario } from "@/lib/inventarioMagazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_LEGNO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_LEGNO_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const tutti = await getLegni({ soloAttivi: true });
  if (tutti.length === 0) {
    return NextResponse.json({ error: "Nessun legno attivo da inventariare" }, { status: 400 });
  }

  try {
    const sessione = await apriInventario({
      categoria: "legno",
      ambito: "tutto",
      ambitoValore: null,
      operatore: session.name,
      righe: tutti.map(l => ({
        entitaId: l.id,
        codice: l.essenza,
        descrizione: l.qualita ?? l.essenza,
        giacenzaTeorica: l.giacenzaAttuale,
      })),
    });
    void logOperation(session.name, "CREATE", "inventario_magazzino", sessione.id, { categoria: "legno", ambito: "tutto", articoli: tutti.length });
    revalidatePath("/magazzino/legno/inventario");
    return NextResponse.json(sessione);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
