import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getTranciati } from "@/lib/tranciatiRepository";
import { apriInventario } from "@/lib/inventarioMagazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_TRANCIATI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_TRANCIATI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const tutti = await getTranciati({ soloAttivi: true });
  if (tutti.length === 0) {
    return NextResponse.json({ error: "Nessun tranciato attivo da inventariare" }, { status: 400 });
  }

  try {
    const sessione = await apriInventario({
      categoria: "tranciati",
      ambito: "tutto",
      ambitoValore: null,
      operatore: session.name,
      righe: tutti.map(t => ({
        entitaId: t.id,
        codice: t.essenza,
        descrizione: t.qualita ?? t.essenza,
        giacenzaTeorica: t.giacenzaAttuale,
      })),
    });
    void logOperation(session.name, "CREATE", "inventario_magazzino", sessione.id, { categoria: "tranciati", ambito: "tutto", articoli: tutti.length });
    revalidatePath("/magazzino/tranciati/inventario");
    return NextResponse.json(sessione);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
