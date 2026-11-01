import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getGiriByScheda, createGiro } from "@/lib/giriRepository";
import { creaMovimentiGiro } from "@/lib/ritiriRepository";
import type { NuovoGiroInput } from "@/lib/types";
import { getSessionFromRequest, MODIFICA_SCHEDA_ROLES } from "@/lib/auth";
import { logOperation } from "@/lib/audit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  try {
    const { id } = await params;
    return NextResponse.json(await getGiriByScheda(id));
  } catch (e) {
    console.error("[GET /api/schede/[id]/giri]", e);
    return NextResponse.json({ error: "Errore lettura giri" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !MODIFICA_SCHEDA_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const { inviamoNoi, trasportoRitorno, ...dati }: NuovoGiroInput = await req.json();
    const giro = await createGiro(id, dati);
    // Il giro nasce con i suoi trasporti già in Ritiri e Consegne. Se fallisce il giro resta:
    // i movimenti si possono sempre pianificare a mano dalla tab Fornitore.
    try {
      await creaMovimentiGiro(giro.id, { inviamoNoi, trasportoRitorno });
    } catch (e) {
      console.error("[POST /api/schede/[id]/giri] creaMovimentiGiro:", e);
    }
    revalidatePath("/schede");
    revalidatePath("/ritiri");
    void logOperation(session.name, "CREATE", "scheda_giro", giro.id, { schedaId: id, inviamoNoi, trasportoRitorno, ...dati } as Record<string, unknown>);
    return NextResponse.json(giro, { status: 201 });
  } catch (e) {
    console.error("[POST /api/schede/[id]/giri]", e);
    return NextResponse.json({ error: "Errore creazione giro" }, { status: 500 });
  }
}
