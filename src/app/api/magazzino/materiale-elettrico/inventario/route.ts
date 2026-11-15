import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getMaterialeElettrico } from "@/lib/materialeElettricoRepository";
import { apriInventario } from "@/lib/inventarioMagazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_MATERIALE_ELETTRICO_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_MATERIALE_ELETTRICO_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const tutti = await getMaterialeElettrico({ soloAttivi: true });
  if (tutti.length === 0) {
    return NextResponse.json({ error: "Nessun articolo attivo da inventariare" }, { status: 400 });
  }

  try {
    const sessione = await apriInventario({
      categoria: "materiale_elettrico",
      ambito: "tutto",
      ambitoValore: null,
      operatore: session.name,
      righe: tutti.map(p => ({
        entitaId: p.id,
        codice: p.tipoArticolo,
        descrizione: [p.descrizione, p.marca, p.caratteristiche].filter(Boolean).join(" · ") || p.tipoArticolo,
        giacenzaTeorica: p.giacenzaAttuale,
      })),
    });
    void logOperation(session.name, "CREATE", "inventario_magazzino", sessione.id, { categoria: "materiale_elettrico", ambito: "tutto", articoli: tutti.length });
    revalidatePath("/magazzino/materiale-elettrico/inventario");
    return NextResponse.json(sessione);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
