import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getVernici } from "@/lib/verniciRepository";
import { apriInventario, type AmbitoMagazzinoVernici } from "@/lib/inventarioMagazzinoRepository";
import { getSessionFromRequest, MAGAZZINO_VERNICI_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

const AMBITI: AmbitoMagazzinoVernici[] = ["tutto", "tipologia", "colore_codice"];

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !MAGAZZINO_VERNICI_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }

  let body: { ambito?: string; ambitoValore?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  const ambito = (body.ambito ?? "tutto") as AmbitoMagazzinoVernici;
  if (!AMBITI.includes(ambito)) {
    return NextResponse.json({ error: "Ambito non valido" }, { status: 400 });
  }
  if (ambito !== "tutto" && !body.ambitoValore) {
    return NextResponse.json({ error: "Valore ambito obbligatorio" }, { status: 400 });
  }

  const tutte = await getVernici({ soloAttivi: true });
  let inScope = tutte;
  if (ambito === "tipologia") inScope = tutte.filter(v => v.tipologia === body.ambitoValore);
  else if (ambito === "colore_codice") {
    const q = body.ambitoValore!.toLowerCase();
    inScope = tutte.filter(v => v.coloreCodice?.toLowerCase().includes(q));
  }

  if (inScope.length === 0) {
    return NextResponse.json({ error: "Nessuna vernice nell'ambito selezionato" }, { status: 400 });
  }

  try {
    const sessione = await apriInventario({
      categoria: "vernici",
      ambito,
      ambitoValore: ambito === "tutto" ? null : body.ambitoValore,
      operatore: session.name,
      righe: inScope.map(v => ({
        entitaId: v.id,
        codice: v.coloreCodice,
        descrizione: v.coloreNome ?? v.tipologia,
        giacenzaTeorica: v.giacenzaAttuale,
      })),
    });
    void logOperation(session.name, "CREATE", "inventario_magazzino", sessione.id, { categoria: "vernici", ambito, ambitoValore: body.ambitoValore, articoli: inScope.length });
    revalidatePath("/verniciatura/magazzino/inventario");
    return NextResponse.json(sessione);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
