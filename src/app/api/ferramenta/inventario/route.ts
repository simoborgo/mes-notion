import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getArticoliFerramenta } from "@/lib/notion";
import { apriInventario, type InventarioAmbito } from "@/lib/inventarioFerramentaRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const AMBITI: InventarioAmbito[] = ["tutto", "kanban", "ubicazione", "sotto_scorta"];

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  let body: { ambito?: string; ambitoValore?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  const ambito = body.ambito as InventarioAmbito;
  if (!AMBITI.includes(ambito)) {
    return NextResponse.json({ error: "Ambito non valido" }, { status: 400 });
  }
  if (ambito === "ubicazione" && !body.ambitoValore) {
    return NextResponse.json({ error: "Seleziona un'ubicazione" }, { status: 400 });
  }

  const tutti = (await getArticoliFerramenta()).filter(a => a.attivo);
  let inScope = tutti;
  if (ambito === "kanban") inScope = tutti.filter(a => a.metodoGestione === "Kanban");
  else if (ambito === "ubicazione") inScope = tutti.filter(a => a.ubicazione === body.ambitoValore);
  else if (ambito === "sotto_scorta") inScope = tutti.filter(a => a.sogliaMinima != null && a.giacenzaAttuale < a.sogliaMinima);

  if (inScope.length === 0) {
    return NextResponse.json({ error: "Nessun articolo nell'ambito selezionato" }, { status: 400 });
  }

  try {
    const sessione = await apriInventario({
      ambito,
      ambitoValore: ambito === "ubicazione" ? body.ambitoValore : null,
      operatore: session.name,
      righe: inScope.map(a => ({
        articoloId: a.id,
        codiceOs1: a.codiceOs1 || null,
        descrizione: a.descrizione || null,
        giacenzaTeorica: a.giacenzaAttuale,
      })),
    });
    void logOperation(session.name, "CREATE", "inventario_ferramenta", sessione.id, { ambito, ambitoValore: body.ambitoValore, articoli: inScope.length });
    revalidatePath("/ferramenta/inventario");
    return NextResponse.json(sessione);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
