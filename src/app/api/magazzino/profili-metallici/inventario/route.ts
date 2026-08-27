import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getProfiliMetallici } from "@/lib/profiliMetalliciRepository";
import { apriInventario } from "@/lib/inventarioMagazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_PROFILI_METALLICI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_PROFILI_METALLICI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  const tutti = await getProfiliMetallici({ soloAttivi: true });
  if (tutti.length === 0) {
    return NextResponse.json({ error: "Nessun profilo attivo da inventariare" }, { status: 400 });
  }

  try {
    const sessione = await apriInventario({
      categoria: "profili_metallici",
      ambito: "tutto",
      ambitoValore: null,
      operatore: session.name,
      righe: tutti.map(p => ({
        entitaId: p.id,
        codice: p.tipoProfilo,
        descrizione: p.materiale ?? p.tipoProfilo,
        giacenzaTeorica: p.giacenzaAttuale,
      })),
    });
    void logOperation(session.name, "CREATE", "inventario_magazzino", sessione.id, { categoria: "profili_metallici", ambito: "tutto", articoli: tutti.length });
    revalidatePath("/magazzino/profili-metallici/inventario");
    return NextResponse.json(sessione);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
